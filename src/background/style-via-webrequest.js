import {kAppJson, kPopup, kResolve} from '/js/consts';
import {updateDNR} from '/js/dnr';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {CHROME, FIREFOX} from '/js/ua';
import {actionPopupUrl, ownRoot} from '/js/urls';
import {ignoreChromeError, toggleListener} from '/js/util-webext';
import {bgReady, safeTimeout} from './common';
import makePopupData from './popup-data';
import * as stateDb from './state-db';
import {getSectionsByUrl} from './style-manager';
import * as tabMan from './tab-manager';

const idCSP = 'patchCsp';
const idOFF = 'disableAll';
const idXHR = 'styleViaXhr';
const REVOKE_TIMEOUT = 60e3;
const ownId = chrome.runtime.id;
const kSetCookie = 'set-cookie'; // must be lowercase
const kMainFrame = 'main_frame';
const kSubFrame = 'sub_frame';
const rxHOST = /^('non(e|ce-.+?)'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
const rxNONCE = FIREFOX && /(?:^|[;,])\s*style-src\s+[^;,]*?'nonce-([-+/=\w]+)'/;
const BLOB_URL_PREFIX = 'blob:' + ownRoot;
const WR_FILTER = {
  urls: ['*://*/*'],
  types: [kMainFrame, kSubFrame],
};
const makeBlob = data => new Blob([JSON.stringify(data)], {type: kAppJson});
const makeXhrCookie = blobId => `${ownId}=${blobId}; SameSite=Lax`;
const req2key = req => req.tabId + ':' + req.frameId;
const revokeObjectURL = blobId => blobId &&
  (process.env.MV3 ? global.offscreen : URL).revokeObjectURL(BLOB_URL_PREFIX + blobId);
const stylesToPass = {};
const INJECTED_FUNC = function (data) {
  if (this['apply.js'] !== 1) { // storing data only if apply.js hasn't run yet
    this[Symbol.for('styles')] = data;
  }
};
const INJECTED_CODE = `${INJECTED_FUNC}`;
export const webRequestBlocking = browser.permissions.contains({
  permissions: ['webRequestBlocking'],
});
/** @type {Record<string, StyleBlobDNRRule>} */
const dnrRules = {};
let curOFF = false;
let curCSP = false;
let curXHR = false;

if (process.env.MV3) {
  toggle(); // register listeners synchronously so they wake up the SW next time it dies
  global.offscreen.syncLifetimeToSW(true);
}
stateDb.ready?.then(([stateDbData, /*tabs*/, tabsObj]) => {
  const removeRuleIds = [];
  stateDbData.forEach((data, id) => {
    if (id < 0) {
      id = -id;
      const {t: tabId, f: frameId, b: blobId} = /** @type {StyleBlobDNRRule} */data;
      if (tabId in tabsObj) {
        dnrRules[id] = data;
        stylesToPass[tabId + ':' + frameId] = {ruleId: id, blobId};
      } else {
        revokeObjectURL(blobId);
        removeRuleIds.push(id);
        stateDb.remove(-id);
      }
    }
  });
  if (removeRuleIds.length) updateDNR(undefined, removeRuleIds, true);
});
prefs.ready.then(() => {
  toggle(process.env.MV3); // in MV3 this will unregister unused listeners
  prefs.subscribe([idOFF, idCSP, idXHR], toggle);
});
if (CHROME && !process.env.MV3) {
  chrome.webRequest.onBeforeRequest.addListener(openNamedStyle, {
    urls: [ownRoot + '*.user.css'],
    types: [kMainFrame],
  }, ['blocking']);
}
if (CHROME && process.env.BUILD !== 'firefox') {
  chrome.webRequest.onBeforeRequest.addListener(req => {
    // tabId < 0 means the popup is shown normally and not as a page in a tab
    API.data.set(kPopup, req.tabId < 0 && makePopupData());
  }, {
    urls: [actionPopupUrl],
    types: [kMainFrame],
  });
}

function toggle(prefKey) {
  // Must register all listeners synchronously to make them wake the SW
  const mv3init = process.env.MV3 && !prefKey;
  const off = prefs.__values[idOFF];
  const csp = !off && prefs.__values[idCSP];
  const xhr = !off && prefs.__values[idXHR];
  if (!mv3init && xhr === curXHR && csp === curCSP && off === curOFF) {
    return;
  }
  let v;
  if (!process.env.MV3 && (FIREFOX || (xhr || csp) !== (curXHR || curCSP))) {
    v = chrome.webRequest.onHeadersReceived;
    // unregister first since new registrations are additive internally
    toggleListener(v, false, modifyHeaders);
    toggleListener(v, true, modifyHeaders, WR_FILTER, [
      'blocking',
      'responseHeaders',
      xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
    ].filter(Boolean));
  }
  if (mv3init || off !== curOFF) {
    toggleListener(chrome.webRequest.onBeforeRequest, mv3init || !off, prepareStyles, WR_FILTER);
  }
  if (mv3init || CHROME && (v = !off && !xhr) !== (!curOFF && !curXHR)) {
    toggleListener(chrome.webNavigation.onCommitted, v, injectData, {url: [{urlPrefix: 'http'}]});
  }
  curCSP = csp;
  curOFF = off;
  curXHR = xhr;
}

/** @type {typeof chrome.webRequest.onBeforeRequest.callback} */
async function prepareStyles(req) {
  if (bgReady[kResolve]) await bgReady;
  const {url} = req;
  const key = req2key(req);
  const oldData = stylesToPass[key];
  const data = oldData || (stylesToPass[key] = {});
  const thisArg = {sender: (req.tab = {url}, req)};
  const payload = data.payload = getSectionsByUrl.call(thisArg, url, null, true);
  const willStyle = payload.sections.length;
  if (oldData) removePreloadedStyles(null, key, data, willStyle);
  if (process.env.MV3 && curXHR && willStyle) prepareStylesMV3(req, data, key, payload);
  safeTimeout(removePreloadedStyles, REVOKE_TIMEOUT, null, key, data);
}

async function prepareStylesMV3(req, data, key, payload) {
  const blobUrl = await global.offscreen.createObjectURL(makeBlob(payload));
  const blobId = data.blobId = blobUrl.slice(BLOB_URL_PREFIX.length);
  const cookie = makeXhrCookie(blobId);
  const {tabId, frameId} = req;
  let {ruleId = 0} = data;
  if (!ruleId) {
    while (++ruleId in dnrRules) {/**/}
    data.ruleId = ruleId;
  }
  /** @namespace StyleBlobDNRRule */
  stateDb.set(-ruleId, dnrRules[ruleId] = {t: tabId, f: frameId, b: blobId});
  updateDNR([{
    id: ruleId,
    condition: {
      tabIds: [tabId],
      resourceTypes: [frameId ? kSubFrame : kMainFrame],
      // Forcing the rule to be evaluated later, when response headers are received.
      excludedResponseHeaders: [{header: kSetCookie, values: [cookie]}],
    },
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{header: kSetCookie, value: cookie, operation: 'append'}],
    },
  }], [ruleId], true);
}

function injectData(req) {
  const data = stylesToPass[req2key(req)];
  if (data && !data.injected) {
    data.injected = true;
    if (process.env.MV3) {
      chrome.scripting.executeScript({
        target: {tabId: req.tabId, frameIds: [req.frameId]},
        args: [data.payload],
        func: INJECTED_FUNC,
        injectImmediately: true,
      }, ignoreChromeError);
    } else {
      chrome.tabs.executeScript(req.tabId, {
        frameId: req.frameId,
        runAt: 'document_start',
        code: `(${INJECTED_CODE})(${JSON.stringify(data.payload)})`,
      }, ignoreChromeError);
    }
    if (!curXHR) removePreloadedStyles(req);
  }
}

/** @param {chrome.webRequest.WebResponseHeadersDetails} req */
function modifyHeaders(req) {
  const key = req2key(req);
  const data = stylesToPass[key]; if (!data) return;
  const {responseHeaders} = req;
  const {payload} = data;
  const secs = payload.sections;
  const csp = (FIREFOX || curCSP) && findHeader(responseHeaders, 'content-security-policy');
  if (csp) {
    const m = FIREFOX && csp.value.match(rxNONCE);
    if (m) tabMan.set(req.tabId, 'nonce', req.frameId, payload.cfg.nonce = m[1]);
    // We don't change CSP if there are no styles when the page is loaded
    // TODO: show a reminder in the popup to reload the tab when the user enables a style
    if (curCSP && secs[0]) patchCsp(csp);
  }
  if (!secs[0]) {
    removePreloadedStyles(req, key, data);
    return;
  }
  const blobId = curXHR && (data.blobId ??=
    !process.env.MV3 && URL.createObjectURL(makeBlob(payload)).slice(BLOB_URL_PREFIX.length)
  );
  const cookie = blobId && makeXhrCookie(blobId);
  if (blobId && (!process.env.MV3 || !findHeader(responseHeaders, kSetCookie, cookie))) {
    responseHeaders.push({name: kSetCookie, value: cookie});
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

export function removePreloadedStyles(req, key = req2key(req), data = stylesToPass[key], keep) {
  if (!data) return;
  if (!keep) delete stylesToPass[key];
  let v = data.blobId;
  if (v) {
    if (req) safeTimeout(revokeObjectURL, REVOKE_TIMEOUT, v);
    else revokeObjectURL(v);
    data.blobId = '';
  }
  if (process.env.MV3 && !keep && (v = data.ruleId) in dnrRules) {
    delete dnrRules[v];
    updateDNR(undefined, [v], true);
    stateDb.remove(-v);
  }
}

function findHeader(headers, name, value) {
  for (const h of headers) {
    if (h.name.toLowerCase() === name && (value == null || h.value === value)) {
      return h;
    }
  }
}

/** @param {chrome.webRequest.WebRequestBodyDetails} req */
function openNamedStyle(req) {
  if (!req.url.includes('?')) { // skipping our usercss installer
    chrome.tabs.update(req.tabId, {url: 'edit.html?id=' + req.url.split('#')[1]});
    return {cancel: true};
  }
}
