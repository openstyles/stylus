import {API} from '/js/msg';
import popupGetStyles from '/js/popup-get-styles';
import * as prefs from '/js/prefs';
import {CHROME, FIREFOX} from '/js/ua';
import {ownRoot} from '/js/urls';
import {kResolve} from '/js/util';
import {ignoreChromeError, MF_ACTION_HTML} from '/js/util-webext';
import {bgReady, safeTimeout} from './common';
import {getSectionsByUrl} from './style-manager';
import * as tabMan from './tab-manager';

const idCSP = 'patchCsp';
const idOFF = 'disableAll';
const idXHR = 'styleViaXhr';
const rxHOST = /^('non(e|ce-.+?)'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
const rxNONCE = FIREFOX && /(?:^|[;,])\s*style-src\s+[^;,]*?'nonce-([-+/=\w]+)'/;
const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
/** @type {Object<string,StylesToPass>} */
const stylesToPass = {};
const state = {};
const INJECTED_FUNC = function (data) {
  if (this['apply.js'] !== 1) { // storing data only if apply.js hasn't run yet
    this[Symbol.for('styles')] = data;
  }
};
const INJECTED_CODE = `${INJECTED_FUNC}`;

toggle();
prefs.subscribe([idXHR, idOFF, idCSP], toggle);

function toggle() {
  const off = prefs.get(idOFF);
  const csp = prefs.get(idCSP) && !off;
  const xhr = prefs.get(idXHR) && !off;
  if (xhr === state.xhr && csp === state.csp && off === state.off) {
    return;
  }
  const reqFilter = {
    urls: [
      '*://*/*',
      CHROME &&
      chrome.runtime.getURL(MF_ACTION_HTML),
    ].filter(Boolean),
    types: ['main_frame', 'sub_frame'],
  };
  chrome.webNavigation.onCommitted.removeListener(injectData);
  chrome.webRequest.onBeforeRequest.removeListener(prepareStyles);
  chrome.webRequest.onHeadersReceived.removeListener(modifyHeaders);
  if (xhr || csp || FIREFOX) {
    // We unregistered it above so that the optional EXTRA_HEADERS is properly re-registered
    chrome.webRequest.onHeadersReceived.addListener(modifyHeaders, reqFilter, [
      'blocking',
      'responseHeaders',
      xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
    ].filter(Boolean));
  }
  if (!off) {
    chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
  }
  if (CHROME && !off) {
    chrome.webNavigation.onCommitted.addListener(injectData, {url: [{urlPrefix: 'http'}]});
  }
  if (CHROME && !process.env.MV3) {
    chrome.webRequest.onBeforeRequest.addListener(openNamedStyle, {
      urls: [ownRoot + '*.user.css'],
      types: ['main_frame'],
    }, ['blocking']);
  }
  state.csp = csp;
  state.off = off;
  state.xhr = xhr;
}

/** @param {chrome.webRequest.WebRequestBodyDetails} req */
function prepareStyles(req) {
  if (bgReady[kResolve]) return;
  if (req.url.startsWith(ownRoot)) return preloadPopupData();
  const mv3TTL = process.env.MV3 && prefs.get('keepAlive');
  const {url} = req;
  req.tab = {url};
  stylesToPass[req2key(req)] = /** @namespace StylesToPass */ {
    blobId: '',
    payload: getSectionsByUrl.call({sender: req}, url, null, true),
    timer: safeTimeout(cleanUp, (mv3TTL > 0 ? mv3TTL : 10) * 60e3, req),
  };
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
    if (!state.xhr) cleanUp(req);
  }
}

/** @param {chrome.webRequest.WebResponseHeadersDetails} req */
function modifyHeaders(req) {
  const data = stylesToPass[req2key(req)]; if (!data) return;
  const {responseHeaders} = req;
  const {payload} = data;
  const secs = payload.sections;
  const csp = (FIREFOX || state.csp) &&
    responseHeaders.find(h => h.name.toLowerCase() === 'content-security-policy');
  if (csp) {
    const m = FIREFOX && csp.value.match(rxNONCE);
    if (m) tabMan.set(req.tabId, 'nonce', req.frameId, payload.cfg.nonce = m[1]);
    // We don't change CSP if there are no styles when the page is loaded
    // TODO: show a reminder in the popup to reload the tab when the user enables a style
    if (state.csp && secs[0]) patchCsp(csp);
  }
  if (!secs[0]) {
    cleanUp(req);
    return;
  }
  if (state.xhr) {
    data.blobId = URL.createObjectURL(new Blob([JSON.stringify(payload)]))
      .slice(blobUrlPrefix.length);
    responseHeaders.push({
      name: 'Set-Cookie',
      value: `${chrome.runtime.id}=${data.blobId}; SameSite=Lax`,
    });
  }
  if (state.xhr || csp && state.csp) {
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

async function preloadPopupData() {
  API.data.set('popupData', await popupGetStyles());
}

function cleanUp(req) {
  const key = req2key(req);
  const data = stylesToPass[key];
  if (data) {
    delete stylesToPass[key];
    clearTimeout(data.timer);
    if (data.blobId) {
      URL.revokeObjectURL(blobUrlPrefix + data.blobId);
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

function req2key(req) {
  return req.tabId + ':' + req.frameId;
}
