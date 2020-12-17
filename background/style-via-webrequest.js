'use strict';

define(async require => {
  const {API} = require('/js/msg');
  const {isEmptyObj} = require('/js/polyfill');
  const prefs = require('/js/prefs');

  const idCSP = 'patchCsp';
  const idOFF = 'disableAll';
  const idXHR = 'styleViaXhr';
  const rxHOST = /^('none'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  const stylesToPass = {};
  const state = {};

  await prefs.initializing;
  prefs.subscribe([idXHR, idOFF, idCSP], toggle);
  toggle();

  function toggle() {
    const off = prefs.get(idOFF);
    const csp = prefs.get(idCSP) && !off;
    const xhr = prefs.get(idXHR) && !off;
    if (xhr === state.xhr && csp === state.csp && off === state.off) {
      return;
    }
    const reqFilter = {
      urls: ['*://*/*'],
      types: ['main_frame', 'sub_frame'],
    };
    chrome.webNavigation.onCommitted.removeListener(injectData);
    chrome.webRequest.onBeforeRequest.removeListener(prepareStyles);
    chrome.webRequest.onHeadersReceived.removeListener(modifyHeaders);
    if (xhr || csp) {
      // We unregistered it above so that the optional EXTRA_HEADERS is properly re-registered
      chrome.webRequest.onHeadersReceived.addListener(modifyHeaders, reqFilter, [
        'blocking',
        'responseHeaders',
        xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
      ].filter(Boolean));
    }
    if (!off) {
      chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
      chrome.webNavigation.onCommitted.addListener(injectData, {url: [{urlPrefix: 'http'}]});
    }
    state.csp = csp;
    state.off = off;
    state.xhr = xhr;
  }

  /** @param {chrome.webRequest.WebRequestBodyDetails} req */
  async function prepareStyles(req) {
    const sections = await API.styles.getSectionsByUrl(req.url);
    if (!isEmptyObj(sections)) {
      stylesToPass[req.url] = JSON.stringify(sections);
      setTimeout(cleanUp, 600e3, req.url);
    }
  }

  function injectData(req) {
    const str = stylesToPass[req.url];
    if (str) {
      chrome.tabs.executeScript(req.tabId, {
        frameId: req.frameId,
        runAt: 'document_start',
        code: `(${data => {
          if (self.INJECTED !== 1) { // storing data only if apply.js hasn't run yet
            window[Symbol.for('styles')] = data;
          }
        }})(${str})`,
      });
    }
  }

  function makeObjectUrl(data) {
    const blob = new Blob([data]);
    return URL.createObjectURL(blob).slice(blobUrlPrefix.length);
  }

  /** @param {chrome.webRequest.WebResponseHeadersDetails} req */
  function modifyHeaders(req) {
    const {responseHeaders} = req;
    const str = stylesToPass[req.url];
    if (!str) {
      return;
    }
    if (state.xhr) {
      responseHeaders.push({
        name: 'Set-Cookie',
        value: `${chrome.runtime.id}=${makeObjectUrl(str)}`,
      });
    }
    const csp = state.csp &&
      responseHeaders.find(h => h.name.toLowerCase() === 'content-security-policy');
    if (csp) {
      patchCsp(csp);
    }
    if (state.xhr || csp) {
      return {responseHeaders};
    }
  }

  /** @param {chrome.webRequest.HttpHeader} csp */
  function patchCsp(csp) {
    const src = {};
    for (let p of csp.value.split(';')) {
      p = p.trim().split(/\s+/);
      src[p[0]] = p.slice(1);
    }
    // Allow style assets
    patchCspSrc(src, 'img-src', 'data:', '*');
    patchCspSrc(src, 'font-src', 'data:', '*');
    // Allow our DOM styles
    patchCspSrc(src, 'style-src', "'unsafe-inline'");
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
      list.push(...values.filter(v => !list.includes(v) && !def.includes(v)));
      if (!list.length) delete src[name];
    }
  }

  function cleanUp(key) {
    const blobId = stylesToPass[key];
    delete stylesToPass[key];
    if (blobId) URL.revokeObjectURL(blobUrlPrefix + blobId);
  }
});
