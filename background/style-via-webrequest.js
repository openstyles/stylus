/* global API CHROME prefs */
'use strict';

// eslint-disable-next-line no-unused-expressions
CHROME && (async () => {
  const idCsp = 'patchCsp';
  const idOff = 'disableAll';
  const idXhr = 'styleViaXhr';
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  const stylesToPass = {};
  const enabled = {};

  await prefs.initializing;
  prefs.subscribe([idXhr, idOff, idCsp], toggle, {now: true});

  function toggle() {
    const csp = prefs.get(idCsp) && !prefs.get(idOff);
    const xhr = prefs.get(idXhr) && !prefs.get(idOff) && Boolean(chrome.declarativeContent);
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
    api.onPageChanged.removeRules([idXhr], async () => {
      if (enabled.xhr) {
        api.onPageChanged.addRules([{
          id: idXhr,
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
    const csp = responseHeaders.find(h => h.name.toLowerCase() === 'content-security-policy');
    const id = stylesToPass[req.requestId];
    if (!id) {
      return;
    }
    let res;
    if (enabled.xhr) {
      res = true;
      responseHeaders.push({
        name: 'Set-Cookie',
        value: `${chrome.runtime.id}=${prefs.get(idOff) ? 1 : 0}${id}`,
      });
      // Allow cookies in CSP sandbox (known case: raw github urls)
      if (csp) {
        csp.value = csp.value.replace(/(?:^|;)\s*sandbox(\s+[^;]*|)(?=;|$)/, (s, allow) =>
          allow.split(/\s+/).includes('allow-same-origin') ? s : `${s} allow-same-origin`);
      }
    }
    if (enabled.csp && csp) {
      res = true;
      const src = {};
      for (let p of csp.value.split(';')) {
        p = p.trim().split(/\s+/);
        src[p[0]] = p.slice(1);
      }
      addToCsp(src, 'img-src', 'data:', '*');
      addToCsp(src, 'font-src', 'data:', '*');
      addToCsp(src, 'style-src', "'unsafe-inline'");
      csp.value = Object.entries(src).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
    }
    if (res) {
      return {responseHeaders};
    }
  }

  function addToCsp(src, name, ...values) {
    const list = src[name] || (src[name] = []);
    const def = src['default-src'] || [];
    list.push(...values.filter(v => !list.includes(v) && !def.includes(v)));
    if (!list.length) delete src[name];
  }

  function cleanUp(key) {
    const blobId = stylesToPass[key];
    delete stylesToPass[key];
    if (blobId) URL.revokeObjectURL(blobUrlPrefix + blobId);
  }
})();