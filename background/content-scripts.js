/* global msg queryTabs ignoreChromeError URLS */
/* exported contentScripts */
'use strict';

const contentScripts = (() => {
  const NTP = 'chrome://newtab/';
  const ALL_URLS = '<all_urls>';
  const SCRIPTS = chrome.runtime.getManifest().content_scripts;
  // expand * as .*?
  const wildcardAsRegExp = (s, flags) => new RegExp(
      s.replace(/[{}()[\]/\\.+?^$:=!|]/g, '\\$&')
        .replace(/\*/g, '.*?'), flags);
  for (const cs of SCRIPTS) {
    cs.matches = cs.matches.map(m => (
      m === ALL_URLS ? m : wildcardAsRegExp(m)
    ));
  }
  const busyTabs = new Set();
  let busyTabsTimer;
  return {injectToTab, injectToAllTabs};

  function injectToTab({url, tabId, frameId = null}) {
    for (const script of SCRIPTS) {
      if (
        script.matches.some(match =>
          (match === ALL_URLS || url.match(match)) &&
          (!url.startsWith('chrome') || url === NTP))
      ) {
        doInject(tabId, frameId, script);
      }
    }
  }

  function doInject(tabId, frameId, script) {
    const options = frameId === null ? {} : {frameId};
    msg.sendTab(tabId, {method: 'ping'}, options)
      .catch(() => false)
      .then(pong => {
        if (pong) {
          return;
        }
        const options = {
          runAt: script.run_at,
          allFrames: script.all_frames,
          matchAboutBlank: script.match_about_blank
        };
        if (frameId !== null) {
          options.allFrames = false;
          options.frameId = frameId;
        }
        for (const file of script.js) {
          chrome.tabs.executeScript(tabId, Object.assign({file}, options), ignoreChromeError);
        }
      });
  }

  function injectToAllTabs() {
    return queryTabs({}).then(tabs => {
      for (const tab of tabs) {
        // skip unloaded/discarded/chrome tabs
        if (!tab.width || tab.discarded || !URLS.supported(tab.url)) continue;
        // our content scripts may still be pending injection at browser start so it's too early to ping them
        if (tab.status === 'loading') {
          trackBusyTab(tab.id, true);
        } else {
          injectToTab({
            url: tab.url,
            tabId: tab.id
          });
        }
      }
    });
  }

  function toggleBusyTabListeners(state) {
    const toggle = state ? 'addListener' : 'removeListener';
    chrome.webNavigation.onCompleted[toggle](onBusyTabUpdated);
    chrome.webNavigation.onErrorOccurred[toggle](onBusyTabUpdated);
    chrome.webNavigation.onTabReplaced[toggle](onBusyTabReplaced);
    chrome.tabs.onRemoved[toggle](onBusyTabRemoved);
    if (state) {
      busyTabsTimer = setTimeout(toggleBusyTabListeners, 15e3, false);
    } else {
      clearTimeout(busyTabsTimer);
    }
  }

  function trackBusyTab(tabId, state) {
    busyTabs[state ? 'add' : 'delete'](tabId);
    if (state && busyTabs.size === 1) toggleBusyTabListeners(true);
    if (!state && !busyTabs.size) toggleBusyTabListeners(false);
  }

  function onBusyTabUpdated({error, frameId, tabId, url}) {
    if (!frameId && busyTabs.has(tabId)) {
      trackBusyTab(tabId, false);
      if (url && !error) {
        injectToTab({tabId, url});
      }
    }
  }

  function onBusyTabReplaced({replacedTabId}) {
    trackBusyTab(replacedTabId, false);
  }

  function onBusyTabRemoved(tabId) {
    trackBusyTab(tabId, false);
  }
})();
