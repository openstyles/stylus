/* global
  CHROME
  FIREFOX
  ignoreChromeError
  msg
  URLS
*/
'use strict';

(() => {
  /** @type {Set<function(data: Object, type: string)>} */
  const listeners = new Set();
  /** @type {NavigatorUtil} */
  const navigatorUtil = window.navigatorUtil = new Proxy({
    onUrlChange(fn) {
      listeners.add(fn);
    },
  }, {
    get(target, prop) {
      return target[prop] ||
        (target = chrome.webNavigation[prop]).addListener.bind(target);
    },
  });

  navigatorUtil.onCommitted(onNavigation.bind('committed'));
  navigatorUtil.onHistoryStateUpdated(onFakeNavigation.bind('history'));
  navigatorUtil.onReferenceFragmentUpdated(onFakeNavigation.bind('hash'));
  navigatorUtil.onCommitted(runGreasyforkContentScript, {
    // expose style version on greasyfork/sleazyfork 1) info page and 2) code page
    url: ['greasyfork', 'sleazyfork'].map(host => ({
      hostEquals: host + '.org',
      urlMatches: '/scripts/\\d+[^/]*(/code)?([?#].*)?$',
    })),
  });
  if (FIREFOX) {
    navigatorUtil.onDOMContentLoaded(runMainContentScripts, {
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
})();

/**
 * @typedef NavigatorUtil
 * @property {NavigatorUtilEvent} onBeforeNavigate
 * @property {NavigatorUtilEvent} onCommitted
 * @property {NavigatorUtilEvent} onCompleted
 * @property {NavigatorUtilEvent} onCreatedNavigationTarget
 * @property {NavigatorUtilEvent} onDOMContentLoaded
 * @property {NavigatorUtilEvent} onErrorOccurred
 * @property {NavigatorUtilEvent} onHistoryStateUpdated
 * @property {NavigatorUtilEvent} onReferenceFragmentUpdated
 * @property {NavigatorUtilEvent} onTabReplaced
*/
/**
 * @typedef {function(cb: function, filters: WebNavigationEventFilter?)} NavigatorUtilEvent
 */
