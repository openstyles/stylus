import {kAppJson, kMainFrame, kPopup, kStyleViaXhr, kSubFrame} from '@/js/consts';
import {updateSessionRules} from '@/js/dnr';
import {CLIENT} from '@/js/port';
import * as prefs from '@/js/prefs';
import {CHROME, FIREFOX} from '@/js/ua';
import {actionPopupUrl, ownRoot} from '@/js/urls';
import {deepEqual, isEmptyObj} from '@/js/util';
import {ownId, toggleListener} from '@/js/util-webext';
import * as colorScheme from './color-scheme';
import {bgBusy, bgPreInit, clientDataJobs, dataHub, onUnload} from './common';
import {stateDB} from './db';
import {webNavigation} from './navigation-manager';
import offscreen from './offscreen';
import makePopupData from './popup-data';
import {getSectionsByUrl} from './style-manager';
import tabCache, * as tabMan from './tab-manager';

const idCSP = 'patchCsp';
const idOFF = 'disableAll';
const REVOKE_TIMEOUT = 10e3;
const kRuleIds = 'ruleIds';
const kSetCookie = 'set-cookie'; // must be lowercase
const rxHOST = /^('non(e|ce-.+?)'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
const rxNONCE = /(?:^|[;,])\s*style-src\s+[^;,]*?'nonce-([-+/=\w]+)'/;
const BLOB_URL_PREFIX = 'blob:' + ownRoot;
const WEBNAV_FILTER = {url: [{urlPrefix: 'http'}]};
const WR_FILTER = {
  urls: ['*://*/*'],
  types: [kMainFrame, kSubFrame],
};
const makeBlob = data => new Blob([JSON.stringify(data)], {type: kAppJson});
const makeXhrCookie = blobId => `${ownId}=${blobId}; SameSite=Lax`;
const req2key = req => req.tabId + ':' + req.frameId;
const revokeObjectURL = blobId => blobId &&
  (__.MV3 ? offscreen : URL).revokeObjectURL(BLOB_URL_PREFIX + blobId);
const toSend = {};
export const webRequestBlocking = __.BUILD !== 'chrome' && FIREFOX
|| browser.permissions.contains({
  permissions: ['webRequestBlocking'],
});
const ruleIdKeys = {};
let ruleIds;
let timer;
let curOFF = true;
let curCSP = false;
let curXHR = false;

if (__.MV3) {
  toggle(); // register listeners synchronously so they wake up the SW next time it dies
  bgPreInit.push((async () => {
    ruleIds = await stateDB.get(kRuleIds) || {};
    for (const id in ruleIds) ruleIdKeys[ruleIds[id]] = +id;
  })());
  bgBusy.then(() => setTimeout(() => prefs.subscribe(kStyleViaXhr, (key, val) => {
    if (val || offscreen[CLIENT])
      offscreen.keepAlive(val);
  }, true), clientDataJobs.size ? 50/*let the client page load first*/ : 0));
}

prefs.ready.then(() => {
  toggle(__.MV3); // in MV3 this will unregister unused listeners
  prefs.subscribe([idOFF, idCSP, kStyleViaXhr], toggle);
});

bgBusy.then(() => {
  const tabIds = [];
  for (let key in ruleIdKeys) {
    if (!tabCache[key = parseInt(key)]) {
      tabIds.push(key);
    }
  }
  if (tabIds.length) removeTabData(tabIds);
});

onUnload.add((tabId, frameId) => {
  if (frameId) setTimeout(removePreloadedStyles, REVOKE_TIMEOUT, null, tabId + ':' + frameId);
  else removeTabData([tabId]);
});

webNavigation.onErrorOccurred.addListener(removePreloadedStyles, WEBNAV_FILTER);

if (CHROME && !__.MV3 && __.BUILD !== 'firefox') {
  chrome.webRequest.onBeforeRequest.addListener(openNamedStyle, {
    urls: [ownRoot + '*.user.css'],
    types: [kMainFrame],
  }, ['blocking']);
}

if (CHROME && __.BUILD !== 'firefox') {
  chrome.webRequest.onBeforeRequest.addListener(req => {
    // tabId < 0 means the popup is shown normally and not as a page in a tab
    dataHub[kPopup] = req.tabId < 0 && makePopupData();
  }, {
    urls: [actionPopupUrl],
    types: [kMainFrame],
  });
}

function toggle(prefKey) {
  // Must register all listeners synchronously to make them wake the SW
  const mv3init = __.MV3 && !prefKey;
  const off = prefs.__values[idOFF];
  const csp = !off && prefs.__values[idCSP];
  const xhr = !off && prefs.__values[kStyleViaXhr];
  if (!mv3init && xhr === curXHR && csp === curCSP && off === curOFF) {
    return;
  }
  let v;
  if (__.BUILD !== 'chrome' && FIREFOX || off !== curOFF && (
    __.MV3
      ? csp !== curCSP
      : (xhr || csp) !== (curXHR || curCSP)
  )) {
    v = chrome.webRequest.onHeadersReceived;
    // unregister first since new registrations are additive internally
    toggleListener(v, false, modifyHeaders);
    toggleListener(v, !off, modifyHeaders, WR_FILTER, [
      'blocking',
      'responseHeaders',
      !__.MV3 && xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
    ].filter(Boolean));
  }
  // In MV3 even without xhr/csp we need it to wake up the background script earlier to avoid FOUC
  if (mv3init || off !== curOFF && (__.MV3 || (xhr || csp) !== (curXHR || curCSP))) {
    toggleListener(chrome.webRequest.onBeforeRequest,
      mv3init || !off && (__.MV3 || xhr || csp),
      prepareStyles, WR_FILTER);
  }
  curCSP = csp;
  curOFF = off;
  curXHR = xhr;
}

/** @param {browser.webRequest._OnBeforeRequestDetails} req */
async function prepareStyles(req) {
  const {tabId, frameId, url} = req; if (tabId < 0) return;
  const key = tabId + ':' + frameId;
  const isInit = bgBusy;
  __.DEBUGLOG('prepareStyles', key, req);
  if (!curXHR && !curCSP && !bgBusy)
    return;
  if (bgBusy)
    await bgBusy;
  if (curXHR && colorScheme.isSystem() && (isInit || !tabMan.someInjectable()))
    await colorScheme.refreshSystemDark();
  const oldData = toSend[key];
  const data = oldData || {};
  const payload = data.payload = getSectionsByUrl.call({sender: req}, url, null, kStyleViaXhr);
  const willStyle = payload.sections.length;
  data.url = url;
  if (oldData) removePreloadedStyles(null, key, data, willStyle);
  if (__.MV3 && curXHR && willStyle) {
    await prepareStylesMV3(tabId, frameId, url, data, key, payload);
  }
  toSend[key] = data;
  __.DEBUGLOG('prepareStyles done', key, data);
}

/** @returns {?} falsy = bgPreInit is not locked */
async function prepareStylesMV3(tabId, frameId, url, data, key, payload) {
  let blobId;
  for (const k in toSend) {
    if (key === k) continue;
    const val = toSend[k];
    if (val.url === url && deepEqual(payload, val.payload)) {
      setTimeout(removeTemporaryTab, REVOKE_TIMEOUT, tabId);
      payload = val.payload;
      blobId = val.blobId;
      break;
    }
  }
  if (!blobId) {
    blobId = (await offscreen.createObjectURL(makeBlob(payload)))
      .slice(BLOB_URL_PREFIX.length);
  }
  data.blobId = blobId;
  const cookie = makeXhrCookie(blobId);
  let {ruleId = 0} = data;
  if (!ruleId) {
    while (++ruleId in ruleIds) {/**/}
    data.ruleId = ruleId;
  }
  ruleIds[ruleId] = key;
  ruleIdKeys[key] = ruleId;
  timer ??= setTimeout(flushState);
  await updateSessionRules([{
    id: ruleId,
    condition: {
      tabIds: [tabId],
      urlFilter: '|' + url + '|',
      resourceTypes: [frameId ? kSubFrame : kMainFrame],
      // Forcing the rule to be evaluated later, when response headers are received.
      excludedResponseHeaders: [{header: kSetCookie, values: [cookie]}],
    },
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{header: kSetCookie, value: cookie, operation: 'append'}],
    },
  }]);
}

/** @param {chrome.webRequest.WebResponseHeadersDetails} req */
function modifyHeaders(req) {
  const key = req2key(req);
  const data = toSend[key]; if (!data) return;
  const {responseHeaders} = req;
  const {payload} = data;
  const secs = payload.sections;
  const csp = (FIREFOX || curCSP) && findHeader(responseHeaders, 'content-security-policy');
  if (csp) {
    const m = csp.value.match(rxNONCE);
    if (m) tabMan.set(req.tabId, 'nonce', req.frameId, payload.cfg.nonce = m[1]);
    // We don't change CSP if there are no styles when the page is loaded
    // TODO: show a reminder in the popup to reload the tab when the user enables a style
    if (curCSP && secs[0]) patchCsp(csp);
  }
  if (!secs[0]) {
    removePreloadedStyles(req, key, data);
    return;
  }
  let blobId;
  if (curXHR && (
    blobId = (data.blobId ??=
      !__.MV3 && URL.createObjectURL(makeBlob(payload)).slice(BLOB_URL_PREFIX.length)
    ))) {
    blobId = makeXhrCookie(blobId);
    if (!__.MV3 || !findHeader(responseHeaders, kSetCookie, blobId)) {
      responseHeaders.push({name: kSetCookie, value: blobId});
    } else {
      blobId = false;
    }
  }
  if (blobId || csp && curCSP) {
    return {responseHeaders};
  }
}

/** @param {chrome.webRequest.HttpHeader} csp */
function patchCsp(csp) {
  const src = {};
  for (let p of csp.value.split(/[;,]/)) {
    p = p.trim().split(/\s+/);
    src[p[0]] = p.slice(1);
  }
  // Allow style assets
  patchCspSrc(src, 'img-src', 'data:', '*');
  patchCspSrc(src, 'font-src', 'data:', '*');
  // Allow our DOM styles, allow @import from any URL
  patchCspSrc(src, 'style-src', "'unsafe-inline'", '*');
  // Allow our XHR cookies in CSP sandbox (known case: raw github urls)
  if (src.sandbox && !src.sandbox.includes('allow-same-origin')) {
    src.sandbox.push('allow-same-origin');
  }
  csp.value = Object.entries(src).map(([k, v]) =>
    `${k}${v.length ? ' ' : ''}${v.join(' ')}`).join('; ');
}

function patchCspSrc(src, name, ...values) {
  let def = src['default-src'];
  let list = src[name];
  if (def || list) {
    if (!def) def = [];
    if (!list) list = [...def];
    if (values.includes('*')) list = src[name] = list.filter(v => !rxHOST.test(v));
    list.push(...values.filter(v => !list.includes(v)));
    if (!list.length) delete src[name];
  }
}

export function removePreloadedStyles(req, key = req2key(req), data = toSend[key], keep) {
  let v;
  if (data) {
    delete toSend[key];
    if ((v = data.blobId)) {
      if (req) setTimeout(revokeObjectURL, REVOKE_TIMEOUT, v);
      else revokeObjectURL(v);
      data.blobId = '';
    }
    if ((v = data.timer)) {
      data.timer = clearTimeout(v);
    }
  }
  if (__.MV3 && !keep && (data ? ruleIds[v = data.ruleId] : v = ruleIdKeys[key])) {
    delete ruleIds[v];
    delete ruleIdKeys[key];
    timer ??= setTimeout(flushState);
    updateSessionRules(undefined, [v]);
  }
}

function removeTabData(tabIds) {
  tabIds = new RegExp(`^(?:${tabIds.join('|')}):`);
  const ids = [];
  for (const key in ruleIdKeys) {
    if (tabIds.test(key)) {
      const id = ruleIdKeys[key];
      ids.push(id);
      delete ruleIds[id];
      delete ruleIdKeys[key];
    }
  }
  if (ids.length) {
    updateSessionRules(undefined, ids);
    timer ??= setTimeout(flushState);
  }
  for (const key in toSend) {
    if (tabIds.test(key)) {
      removePreloadedStyles(null, key);
    }
  }
}

async function removeTemporaryTab(tabId) {
  try {
    await chrome.tabs.get(tabId);
  } catch {
    tabMan.remove(tabId);
    removeTabData([tabId]);
  }
}

function findHeader(headers, name, value) {
  for (const h of headers) {
    if (h.name.toLowerCase() === name && (value == null || h.value === value)) {
      return h;
    }
  }
}

function flushState() {
  timer = null;
  if (isEmptyObj(ruleIds)) {
    stateDB.delete(kRuleIds);
  } else {
    stateDB.put(ruleIds, kRuleIds);
  }
}

/** @param {chrome.webRequest.WebRequestBodyDetails} req */
function openNamedStyle(req) {
  if (!req.url.includes('?')) { // skipping our usercss installer
    chrome.tabs.update(req.tabId, {url: 'edit.html?id=' + req.url.split('#')[1]});
    return {cancel: true};
  }
}
