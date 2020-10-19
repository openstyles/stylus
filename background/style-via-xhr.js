/* global API CHROME prefs */
'use strict';

// eslint-disable-next-line no-unused-expressions
CHROME && (async () => {
  const prefId = 'styleViaXhr';
  const blobUrlPrefix = 'blob:' + chrome.runtime.getURL('/');
  const stylesToPass = {};

  await prefs.initializing;
  toggle(prefId, prefs.get(prefId));
  prefs.subscribe([prefId], toggle);

  function toggle(key, value) {
    if (!chrome.declarativeContent) { // not yet granted in options page
      value = false;
    }
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
        value: `${chrome.runtime.id}=${blobId}`,
      });
      return {responseHeaders};
    }
  }

  function cleanUp(key) {
    const blobId = stylesToPass[key];
    delete stylesToPass[key];
    if (blobId) URL.revokeObjectURL(blobUrlPrefix + blobId);
  }
})();
