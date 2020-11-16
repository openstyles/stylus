/* global API CHROME prefs */
'use strict';

// eslint-disable-next-line no-unused-expressions
CHROME && (async () => {
  const idCSP = 'patchCsp';
  const idOFF = 'disableAll';
  const idXHR = 'styleViaXhr';
  const rxHOST = /^('none'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  const stylesToPass = {};
  const enabled = {};

  await prefs.initializing;
  prefs.subscribe([idXHR, idOFF, idCSP], toggle, {now: true});

  function toggle() {
    const csp = prefs.get(idCSP) && !prefs.get(idOFF);
    const xhr = prefs.get(idXHR) && !prefs.get(idOFF) && Boolean(chrome.declarativeContent);
    if (xhr === enabled.xhr && csp === enabled.csp) {
      return;
    }
    // Need to unregister first so that the optional EXTRA_HEADERS is properly registered
    chrome.webRequest.onBeforeRequest.removeListener(prepareStyles);
    chrome.webRequest.onHeadersReceived.removeListener(modifyHeaders);
    if (xhr || csp) {
      const reqFilter = {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame'],
      };
      chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
      chrome.webRequest.onHeadersReceived.addListener(modifyHeaders, reqFilter, [
        'blocking',
        'responseHeaders',
        xhr && chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
      ].filter(Boolean));
    }
    if (enabled.xhr !== xhr) {
      enabled.xhr = xhr;
      toggleEarlyInjection();
    }
    enabled.csp = csp;
  }

  /** Runs content scripts earlier than document_start */
  function toggleEarlyInjection() {
    const api = chrome.declarativeContent;
    if (!api) return;
    api.onPageChanged.removeRules([idXHR], async () => {
      if (enabled.xhr) {
        api.onPageChanged.addRules([{
          id: idXHR,
          conditions: [
            new api.PageStateMatcher({
              pageUrl: {urlContains: '://'},
            }),
          ],
          actions: [
            new api.RequestContentScript({
              js: chrome.runtime.getManifest().content_scripts[0].js,
              allFrames: true,
            }),
          ],
        }]);
      }
    });
  }

  /** @param {chrome.webRequest.WebRequestBodyDetails} req */
  function prepareStyles(req) {
    API.getSectionsByUrl(req.url).then(sections => {
      if (Object.keys(sections).length) {
        stylesToPass[req.requestId] = !enabled.xhr ? true :
          URL.createObjectURL(new Blob([JSON.stringify(sections)])).slice(blobUrlPrefix.length);
        setTimeout(cleanUp, 600e3, req.requestId);
      }
    });
  }

  /** @param {chrome.webRequest.WebResponseHeadersDetails} req */
  function modifyHeaders(req) {
    const {responseHeaders} = req;
    const id = stylesToPass[req.requestId];
    if (!id) {
      return;
    }
    if (enabled.xhr) {
      responseHeaders.push({
        name: 'Set-Cookie',
        value: `${chrome.runtime.id}=${id}`,
      });
    }
    const csp = enabled.csp &&
      responseHeaders.find(h => h.name.toLowerCase() === 'content-security-policy');
    if (csp) {
      patchCsp(csp);
    }
    if (enabled.xhr || csp) {
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
    patchCspSrc(src, 'style-src', '\'unsafe-inline\'');
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
})();
