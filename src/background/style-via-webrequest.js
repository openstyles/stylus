import {kPopupData} from '/js/consts';
import {API} from '/js/msg';
import popupGetStyles from '/js/popup-get-styles';
import * as prefs from '/js/prefs';
import {CHROME, FIREFOX} from '/js/ua';
import {ownRoot} from '/js/urls';
import {kResolve} from '/js/util';
import {ignoreChromeError, MF_ACTION_HTML} from '/js/util-webext';
import {bgReady} from './common';
import {getSectionsByUrl} from './style-manager';
import * as tabMan from './tab-manager';

const idCSP = 'patchCsp';
const idOFF = 'disableAll';
const idXHR = 'styleViaXhr';
const rxHOST = /^('non(e|ce-.+?)'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
const rxNONCE = FIREFOX && /(?:^|[;,])\s*style-src\s+[^;,]*?'nonce-([-+/=\w]+)'/;
const BLOB_URL_PREFIX_LEN = ('blob:' + ownRoot).length;
const makeBlob = data => new Blob([JSON.stringify(data)]);
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
let curOFF, curCSP, curXHR;

toggle();
prefs.subscribe([idOFF, idCSP, idXHR], toggle);
prefs.ready.then(() => toggle(true)); // unregister unused listeners
if (CHROME && !process.env.MV3) {
  chrome.webRequest.onBeforeRequest.addListener(openNamedStyle, {
    urls: [ownRoot + '*.user.css'],
    types: ['main_frame'],
  }, ['blocking']);
}

function toggle(prefKey) {
  // Must register all listeners synchronously to make them wake the SW
  const mv3init = process.env.MV3 && !prefKey;
  const off = prefs.__values[idOFF];
  const csp = !off && prefs.__values[idCSP];
  const xhr = !off && prefs.__values[idXHR];
  if (xhr === curXHR && csp === curCSP && off === curOFF) { // will compute to false at init
    return;
  }
  const reqFilter = {
    urls: [
      '*://*/*',
      CHROME && chrome.runtime.getURL(MF_ACTION_HTML),
    ].filter(Boolean),
    types: ['main_frame', 'sub_frame'],
  };
  chrome.webNavigation.onCommitted.removeListener(injectData);
  chrome.webRequest.onBeforeRequest.removeListener(prepareStyles);
  chrome.webRequest.onHeadersReceived.removeListener(modifyHeaders);
  if (xhr || csp || FIREFOX || mv3init) {
    // We unregistered it above so that the optional EXTRA_HEADERS is properly re-registered
    chrome.webRequest.onHeadersReceived.addListener(modifyHeaders, reqFilter, [
      'blocking',
      'responseHeaders',
      xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
    ].filter(Boolean));
  }
  if (!off || mv3init) {
    chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
  }
  if (CHROME && !off && !xhr || mv3init) {
    chrome.webNavigation.onCommitted.addListener(injectData, {url: [{urlPrefix: 'http'}]});
  }
  if (process.env.MV3 && (xhr || curXHR) && !mv3init) {
    const TTL = prefs.__values.keepAlive;
    global.offscreen.setPortTimeout(!xhr || !TTL ? null : TTL * 60e3);
  }
  curCSP = csp;
  curOFF = off;
  curXHR = xhr;
}


/** @param {chrome.webRequest.WebRequestBodyDetails} req */
function prepareStyles(req) {
  if (bgReady[kResolve]) return;
  if (req.url.startsWith(ownRoot)) return preloadPopupData(req);
  const TTL = process.env.MV3 ? prefs.__values.keepAlive : -1;
  const {url} = req;
  const payload = getSectionsByUrl.call({sender: (req.tab = {url}, req)}, url, null, true);
  const timer = setTimeout(cleanUp, TTL > 0 ? TTL * 60e3 : TTL < 0 ? 600e3 : 25e3, req);
  const data = stylesToPass[req2key(req)] = {payload, timer};
  if (process.env.MV3 && curXHR && payload.sections.length) {
    global.offscreen.createObjectURL(makeBlob(payload)).then(blobUrl => {
      data.blobId = blobUrl;
    });
  }
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
    if (!curXHR) cleanUp(req);
  }
}

/** @param {chrome.webRequest.WebResponseHeadersDetails} req */
function modifyHeaders(req) {
  const data = stylesToPass[req2key(req)]; if (!data) return;
  const {responseHeaders} = req;
  const {payload} = data;
  const secs = payload.sections;
  const csp = (FIREFOX || curCSP) &&
    responseHeaders.find(h => h.name.toLowerCase() === 'content-security-policy');
  if (csp) {
    const m = FIREFOX && csp.value.match(rxNONCE);
    if (m) tabMan.set(req.tabId, 'nonce', req.frameId, payload.cfg.nonce = m[1]);
    // We don't change CSP if there are no styles when the page is loaded
    // TODO: show a reminder in the popup to reload the tab when the user enables a style
    if (curCSP && secs[0]) patchCsp(csp);
  }
  if (!secs[0]) {
    cleanUp(req);
    return;
  }
  const blobId = curXHR &&
    (data.blobId ??= !process.env.MV3 && URL.createObjectURL(makeBlob(payload)));
  if (blobId) {
    responseHeaders.push({
      name: 'Set-Cookie',
      value: `${chrome.runtime.id}=${data.blobId.slice(BLOB_URL_PREFIX_LEN)}; SameSite=Lax`,
    });
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

async function preloadPopupData(req) {
  // tabId < 0 means the popup is shown normally and not as a page in a tab
  API.data.set(kPopupData, req.tabId < 0 && popupGetStyles());
}

function cleanUp(req) {
  const key = req2key(req);
  const data = stylesToPass[key];
  if (data) {
    delete stylesToPass[key];
    if (data.timer) clearTimeout(data.timer);
    if (data.blobId) (process.env.MV3 ? global.offscreen : URL).revokeObjectURL(data.blobId);
  }
}

/** @param {chrome.webRequest.WebRequestBodyDetails} req */
function openNamedStyle(req) {
  if (!req.url.includes('?')) { // skipping our usercss installer
    chrome.tabs.update(req.tabId, {url: 'edit.html?id=' + req.url.split('#')[1]});
    return {cancel: true};
  }
}

function req2key(req) {
  return req.tabId + ':' + req.frameId;
}
