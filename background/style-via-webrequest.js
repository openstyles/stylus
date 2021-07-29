/* global API */// msg.js
/* global CHROME ignoreChromeError */// toolbox.js
/* global prefs */
'use strict';

(() => {
  const idCSP = 'patchCsp';
  const idOFF = 'disableAll';
  const idXHR = 'styleViaXhr';
  const rxHOST = /^('none'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  /** @type {Object<string,StylesToPass>} */
  const stylesToPass = {};
  const state = {};
  const injectedCode = CHROME && `${data => {
    if (self.INJECTED !== 1) { // storing data only if apply.js hasn't run yet
      window[Symbol.for('styles')] = data;
    }
  }}`;

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
    if (CHROME ? !off : xhr || csp) {
      chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
    }
    if (CHROME && !off) {
      chrome.webNavigation.onCommitted.addListener(injectData, {url: [{urlPrefix: 'http'}]});
    }
    state.csp = csp;
    state.off = off;
    state.xhr = xhr;
  }

  /** @param {chrome.webRequest.WebRequestBodyDetails} req */
  async function prepareStyles(req) {
    const sections = await API.styles.getSectionsByUrl(req.url);
    stylesToPass[req2key(req)] = /** @namespace StylesToPass */ {
      blobId: '',
      str: JSON.stringify(sections),
      timer: setTimeout(cleanUp, 600e3, req),
    };
  }

  function injectData(req) {
    const data = stylesToPass[req2key(req)];
    if (data && !data.injected) {
      data.injected = true;
      chrome.tabs.executeScript(req.tabId, {
        frameId: req.frameId,
        runAt: 'document_start',
        code: `(${injectedCode})(${data.str})`,
      }, ignoreChromeError);
      if (!state.xhr) cleanUp(req);
    }
  }

  /** @param {chrome.webRequest.WebResponseHeadersDetails} req */
  function modifyHeaders(req) {
    const {responseHeaders} = req;
    const data = stylesToPass[req2key(req)];
    if (!data || data.str === '{}') {
      cleanUp(req);
      return;
    }
    if (state.xhr) {
      data.blobId = URL.createObjectURL(new Blob([data.str])).slice(blobUrlPrefix.length);
      responseHeaders.push({
        name: 'Set-Cookie',
        value: `${chrome.runtime.id}=${data.blobId}`,
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
      list.push(...values.filter(v => !list.includes(v) && !def.includes(v)));
      if (!list.length) delete src[name];
    }
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

  function req2key(req) {
    return req.tabId + ':' + req.frameId;
  }
})();
