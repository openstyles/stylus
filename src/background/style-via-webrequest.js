import {
  kAppJson, kContentType, kMainFrame, kPopup, kStyleIds, kSubFrame, pDisableAll, pPatchCsp,
  pStyleViaXhr,
} from '@/js/consts';
import {updateSessionRules} from '@/js/dnr';
import {CLIENT} from '@/js/port';
import {__values, subscribe} from '@/js/prefs';
import {CHROME, FIREFOX} from '@/js/ua';
import {actionPopupUrl, ownRoot} from '@/js/urls';
import {deepEqual, isEmptyObj} from '@/js/util';
import {ownId, toggleListener, webNavigation} from '@/js/util-webext';
import * as colorScheme from './color-scheme';
import {bgBusy, bgPreInit, clientDataJobs, dataHub, onUnload, WRBTest, WRB} from './common';
import {stateDB} from './db';
import {updateIconBadge} from './icon-manager';
import offscreen from './offscreen';
import {isOptionSite, optionSites} from './option-sites';
import makePopupData from './popup-data';
import {getSectionsByUrl} from './style-manager';
import * as tabMan from './tab-manager';
import {patchCsp, patchCspMetaTag} from './util';

const REVOKE_TIMEOUT = 10e3;
const kRuleIds = 'ruleIds';
const kSetCookie = 'set-cookie'; // must be lowercase
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
const ruleIdKeys = {};
let ruleIds;
let curOFF = true;
let flushPending;

if (__.MV3) {
  setup(); // register listeners synchronously so they can receive the wakeup event
  bgPreInit.push((async () => {
    ruleIds = await stateDB.get(kRuleIds) || {};
    for (const id in ruleIds) ruleIdKeys[ruleIds[id]] = +id;
  })());
  bgBusy.then(() => setTimeout(() => {
    subscribe(pStyleViaXhr, (key, val) => {
      if (val || offscreen[CLIENT]) {
        offscreen.keepAlive(val);
      }
    }, true);
  }, clientDataJobs.size ? 1000/*let the client page load first*/ : 0));
}

subscribe(pDisableAll, setup, true);

bgBusy.then(() => {
  const tabIds = [];
  for (let key in ruleIdKeys) {
    if (!tabMan.tabCache[key = parseInt(key)]) {
      tabIds.push(key);
    }
  }
  if (tabIds.length) removeTabData(tabIds);
});

onUnload.add((tabId, frameId, port) => {
  const key = tabId + ':' + frameId;
  const data = toSend[key];
  if (data) { // new data for this target is prepared
    data.timer = setTimeout(removePreloadedStyles, REVOKE_TIMEOUT, null, key);
  } else if (frameId && tabMan.tabCache[tabId]?.[kStyleIds]) {
    updateIconBadge.call(port, [], true);
    if (!frameId) removeTabData([tabId]);
  }
});

webNavigation.onErrorOccurred.addListener(removePreloadedStyles, WEBNAV_FILTER);

if ((__.B_CHROME || __.B_ANY && CHROME) && !__.MV3) {
  chrome.webRequest.onBeforeRequest.addListener(openNamedStyle, {
    urls: [ownRoot + '*.user.css'],
    types: [kMainFrame],
  }, ['blocking']);
}

if (__.B_CHROME || __.B_ANY && CHROME) {
  chrome.webRequest.onBeforeRequest.addListener(req => {
    // tabId < 0 means the popup is shown normally and not as a page in a tab
    dataHub.set(kPopup, req.tabId < 0 && makePopupData());
  }, {
    urls: [actionPopupUrl],
    types: [kMainFrame],
  });
}

async function setup(_, OFF) {
  if (curOFF !== OFF) {
    curOFF = OFF;
    // in MV3 onBeforeRequest also wakes up the background script earlier to avoid FOUC
    toggleListener(chrome.webRequest.onBeforeRequest, !OFF, prepareStyles, WR_FILTER,
      (__.B_FIREFOX || __.B_ANY && FIREFOX) ? ['blocking'] : []);
    toggleListener(chrome.webRequest.onHeadersReceived, !OFF, modifyHeaders, WR_FILTER, !OFF && [
      'responseHeaders',
      (WRBTest ? await WRBTest : WRB) && 'blocking',
      chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
    ].filter(Boolean));
  }
}

/** @param {browser.webRequest._OnBeforeRequestDetails} req */
async function prepareStyles(req) {
  const init = bgBusy;
  if (init) await init;
  let v;
  const {tabId, frameId, url} = req;
  const key = tabId + ':' + frameId;
  const xhrOn = __values[pStyleViaXhr]
    && (!(v = optionSites[pStyleViaXhr]) || isOptionSite(v, url));
  const cspOn = (__.B_FIREFOX || __.B_ANY && FIREFOX) && __values[pPatchCsp]
    && (!(v = optionSites[pPatchCsp]) || isOptionSite(v, url));
  if (cspOn)
    patchCspMetaTag(req.requestId);
  __.DEBUGLOG('prepareStyles', key, req);
  if (__.MV3 && xhrOn && colorScheme.isSystem() && !tabMan.someInjectable())
    await colorScheme.refreshSystemDark();
  if (tabId < 0 || init/* no point in priming the cache by now */)
    return;
  const oldData = toSend[key];
  const data = oldData || {};
  const payload = getSectionsByUrl.call({sender: req}, url, {init: pStyleViaXhr});
  const samePayload = oldData && deepEqual(payload, data.payload);
  const willStyle = payload.sections.length;
  data.payload = payload;
  data.url = url;
  if (samePayload) data.timer = clearTimeout(data.timer);
  else if (oldData) removePreloadedStyles(null, key, data, willStyle);
  toSend[key] = data;
  if (!__.MV3 || !xhrOn || !willStyle)
    return;
  let blobId;
  if (!samePayload) {
    for (const k in toSend) {
      if (key === k) continue;
      const val = toSend[k];
      if (val.url === url && deepEqual(payload, val.payload)) {
        clearTimeout(val.timer);
        val.timer = setTimeout(removeTemporaryTab, REVOKE_TIMEOUT, tabId);
        Object.assign(payload, val.payload);
        blobId = val.blobId;
        break;
      }
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
  flushPending ??= setTimeout(flushState);
  await updateSessionRules([{
    id: ruleId,
    condition: {
      tabIds: [tabId],
      urlFilter: '|' + url + '|',
      resourceTypes: [frameId ? kSubFrame : kMainFrame],
      // Forcing the rule to be evaluated later, when response headers are received.
      // XML in Chrome is re-rendered by the browser so it can't be styled at document_start
      // Skipping application/xml, text/xml, along with any added cruft like ;charset
      excludedResponseHeaders: [{header: kContentType, values: ['*/xml*']}],
    },
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{header: kSetCookie, value: cookie, operation: 'append'}],
    },
  }]);
}

/** @param {browser.webRequest._OnHeadersReceivedDetails} req */
function modifyHeaders(req) {
  const key = req2key(req);
  const data = toSend[key]; if (!data) return;
  let v;
  const {responseHeaders} = req;
  const {payload} = data;
  const styled = payload.sections.length;
  const cspOn = __values[pPatchCsp]
    && (!(v = optionSites[pPatchCsp]) || isOptionSite(v, req.url));
  let csp = (__.B_FIREFOX || __.B_ANY && FIREFOX || cspOn)
    && findHeader(responseHeaders, 'content-security-policy');
  if (csp) {
    const m = (v = csp.value).match(rxNONCE);
    if (m) tabMan.set(req.tabId, 'nonce', req.frameId, payload.cfg.nonce = m[1]);
    // We don't change CSP if there are no styles when the page is loaded
    // TODO: show a reminder in the popup to reload the tab when the user enables a style
    csp = cspOn && styled && (csp.value = patchCsp(v));
  }
  if (!styled) {
    removePreloadedStyles(req, key, data);
    return;
  }
  let blobId;
  if (__values[pStyleViaXhr] && (
    !(v = optionSites[pStyleViaXhr]) || isOptionSite(v, req.url)
  ) && (
    blobId = (data.blobId ??=
      !__.MV3 && URL.createObjectURL(makeBlob(payload)).slice(BLOB_URL_PREFIX.length)
    )
  )) {
    blobId = makeXhrCookie(blobId);
    if (!__.MV3 || !findHeader(responseHeaders, kSetCookie, blobId)) {
      responseHeaders.push({name: kSetCookie, value: blobId});
    } else {
      blobId = false;
    }
  }
  if (blobId || csp) {
    return {responseHeaders};
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
    flushPending ??= setTimeout(flushState);
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
    flushPending ??= setTimeout(flushState);
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

export function findHeader(headers, name, value) {
  for (const h of headers) {
    if (h.name.toLowerCase() === name && (value == null || h.value === value)) {
      return h;
    }
  }
}

function flushState() {
  flushPending = null;
  if (isEmptyObj(ruleIds)) {
    stateDB.delete(kRuleIds);
  } else {
    stateDB.put(ruleIds, kRuleIds);
  }
}

/** @param {browser.webRequest._OnBeforeRequestDetails} req */
function openNamedStyle(req) {
  if (!req.url.includes('?')) { // skipping our usercss installer
    chrome.tabs.update(req.tabId, {url: 'edit.html?id=' + req.url.split('#')[1]});
    return {cancel: true};
  }
}
