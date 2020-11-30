'use strict';

define(require => {
  const {
    CHROME,
    FIREFOX,
    URLS,
    ignoreChromeError,
  } = require('/js/toolbox');
  const {msg} = require('/js/msg');

  /** @type {Set<function(data: Object, type: string)>} */
  const listeners = new Set();

  const exports = {
    onUrlChange(fn) {
      listeners.add(fn);
    },
  };

  chrome.webNavigation.onCommitted.addListener(onNavigation.bind('committed'));
  chrome.webNavigation.onHistoryStateUpdated.addListener(onFakeNavigation.bind('history'));
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(onFakeNavigation.bind('hash'));
  chrome.webNavigation.onCommitted.addListener(runGreasyforkContentScript, {
    // expose style version on greasyfork/sleazyfork 1) info page and 2) code page
    url: ['greasyfork', 'sleazyfork'].map(host => ({
      hostEquals: host + '.org',
      urlMatches: '/scripts/\\d+[^/]*(/code)?([?#].*)?$',
    })),
  });
  if (FIREFOX) {
    chrome.webNavigation.onDOMContentLoaded.addListener(runMainContentScripts, {
      url: [{
        urlEquals: 'about:blank',
      }],
    });
  }

  /** @this {string} type */
  async function onNavigation(data) {
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
    msg.sendTab(data.tabId, {method: 'urlChanged'}, {frameId: data.frameId})
      .catch(msg.ignoreError);
  }

  /** FF misses some about:blank iframes so we inject our content script explicitly */
  async function runMainContentScripts({tabId, frameId}) {
    if (frameId &&
        !await msg.sendTab(tabId, {method: 'ping'}, {frameId}).catch(ignoreChromeError)) {
      for (const file of chrome.runtime.getManifest().content_scripts[0].js) {
        chrome.tabs.executeScript(tabId, {
          frameId,
          file,
          matchAboutBlank: true,
        }, ignoreChromeError);
      }
    }
  }

  function runGreasyforkContentScript({tabId}) {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-greasyfork.js',
      runAt: 'document_start',
    });
  }

  return exports;
});
