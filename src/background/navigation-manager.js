/* global CHROME FIREFOX URLS deepEqual ignoreChromeError */// toolbox.js
/* global bgReady */// common.js
/* global msg */
/* global tabMan */
'use strict';

/* exported navMan */
const navMan = (() => {
  const listeners = new Set();
  let prevData = {};

  chrome.webNavigation.onCommitted.addListener(onNavigation.bind('committed'));
  chrome.webNavigation.onHistoryStateUpdated.addListener(onFakeNavigation.bind('history'));
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(onFakeNavigation.bind('hash'));

  return {
    /** @param {function(data: Object, type: ('committed'|'history'|'hash'))} fn */
    onUrlChange(fn) {
      listeners.add(fn);
    },
  };

  /** @this {string} type */
  async function onNavigation(data) {
    if (CHROME && data.timeStamp === prevData.timeStamp && deepEqual(data, prevData)) {
      return; // Chrome bug: listener is called twice with identical data
    }
    prevData = data;
    if (CHROME &&
        URLS.chromeProtectsNTP &&
        data.url.startsWith('https://www.google.') &&
        data.url.includes('/_/chrome/newtab?')) {
      // Modern Chrome switched to WebUI NTP so this is obsolete, but there may be exceptions
      // TODO: investigate, and maybe use a separate listener for CHROME <= ver
      const tab = await browser.tabs.get(data.tabId);
      const url = tab.pendingUrl || tab.url;
      if (url === 'chrome://newtab/') {
        data.url = url;
      }
    }
    listeners.forEach(fn => fn(data, this));
  }

  /** @this {string} type */
  function onFakeNavigation(data) {
    onNavigation.call(this, data);
    const {tabId} = data;
    const td = tabMan.get(tabId); if (!td) return;
    const {url, frameId: f, documentId: d} = data;
    const iid = !d && (td.iid || {})[f];
    const to = d ? {documentId: d} : {frameId: f};
    msg.sendTab(tabId, {method: 'urlChanged', iid, url}, to);
  }
})();

bgReady.all.then(() => {
  /*
   * Expose style version on greasyfork/sleazyfork 1) info page and 2) code page
   * Not using manifest.json to avoid injecting in unrelated sub-pages.
   */
  const urlMatches = '/scripts/\\d+[^/]*(/code)?([?#].*)?$';
  chrome.webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-greasyfork.js',
      runAt: 'document_start',
    });
  }, {
    url: [
      {hostEquals: 'greasyfork.org', urlMatches},
      {hostEquals: 'sleazyfork.org', urlMatches},
    ],
  });

  /*
   * Removes the Get Stylus button on style pages.
   * Not using manifest.json as adding a content script may disable the extension on update.
   */
  chrome.webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-userstylesworld.js',
      runAt: 'document_start',
    });
  }, {
    url: [
      {hostEquals: 'userstyles.world'},
    ],
  });
  /*
   * FF misses some about:blank iframes so we inject our content script explicitly
   */
  if (FIREFOX) {
    chrome.webNavigation.onDOMContentLoaded.addListener(async ({tabId, frameId}) => {
      if (frameId &&
          !await msg.sendTab(tabId, {method: 'ping'}, {frameId})) {
        for (const file of chrome.runtime.getManifest().content_scripts[0].js) {
          chrome.tabs.executeScript(tabId, {
            frameId,
            file,
            matchAboutBlank: true,
          }, ignoreChromeError);
        }
      }
    }, {
      url: [{urlEquals: 'about:blank'}],
    });
  }
});
