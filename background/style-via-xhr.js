/* global API CHROME prefs */
'use strict';

// eslint-disable-next-line no-unused-expressions
CHROME && (async () => {
  const prefId = 'styleViaXhr';
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  const stylesToPass = {};
  let enabled;

  await prefs.initializing;
  prefs.subscribe([prefId, 'disableAll'], toggle, {now: true});

  function toggle() {
    let value = prefs.get(prefId) && !prefs.get('disableAll');
    if (!chrome.declarativeContent) { // not yet granted in options page
      value = false;
    }
    if (value === enabled) {
      return;
    }
    enabled = value;
    if (value) {
      const reqFilter = {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame'],
      };
      chrome.webRequest.onBeforeRequest.addListener(prepareStyles, reqFilter);
      chrome.webRequest.onHeadersReceived.addListener(passStyles, reqFilter, [
        'blocking',
        'responseHeaders',
        chrome.webRequest.OnHeadersReceivedOptions.EXTRA_HEADERS,
      ].filter(Boolean));
    } else {
      chrome.webRequest.onBeforeRequest.removeListener(prepareStyles);
      chrome.webRequest.onHeadersReceived.removeListener(passStyles);
    }
    if (!chrome.declarativeContent) {
      return;
    }
    chrome.declarativeContent.onPageChanged.removeRules([prefId], async () => {
      if (!value) return;
      chrome.declarativeContent.onPageChanged.addRules([{
        id: prefId,
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {urlContains: ':'},
          }),
        ],
        actions: [
          new chrome.declarativeContent.RequestContentScript({
            allFrames: true,
            // This runs earlier than document_start
            js: chrome.runtime.getManifest().content_scripts[0].js,
          }),
        ],
      }]);
    });
  }

  /** @param {chrome.webRequest.WebRequestBodyDetails} req */
  function prepareStyles(req) {
    API.getSectionsByUrl(req.url).then(sections => {
      const str = JSON.stringify(sections);
      if (str !== '{}') {
        stylesToPass[req.requestId] = URL.createObjectURL(new Blob([str])).slice(blobUrlPrefix.length);
        setTimeout(cleanUp, 600e3, req.requestId);
      }
    });
  }

  /** @param {chrome.webRequest.WebResponseHeadersDetails} req */
  function passStyles(req) {
    const blobId = stylesToPass[req.requestId];
    if (blobId) {
      const {responseHeaders} = req;
      responseHeaders.push({
        name: 'Set-Cookie',
        value: `${chrome.runtime.id}=${prefs.get('disableAll') ? 1 : 0}${blobId}`,
      });
      // allow cookies or strip sandbox from CSP (known case: raw github urls)
      for (const h of responseHeaders) {
        if (h.name.toLowerCase() === 'content-security-policy' && h.value.includes('sandbox')) {
          h.value = h.value.replace(/((?:^|;)\s*sandbox)(\s+[^;]+)?\s*(?=;|$)/,
            (_, a, b) => !b || b === 'allow-same-origin' ? `${a} allow-same-origin` : '');
          break;
        }
      }
      return {responseHeaders};
    }
  }

  function cleanUp(key) {
    const blobId = stylesToPass[key];
    delete stylesToPass[key];
    if (blobId) URL.revokeObjectURL(blobUrlPrefix + blobId);
  }
})();
