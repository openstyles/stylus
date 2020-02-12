/* global msg queryTabs ignoreChromeError */
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
      const busyTabs = new Set();
      for (const tab of tabs) {
        // skip unloaded/discarded tabs
        if (!tab.width || tab.discarded) continue;
        // our content scripts may still be pending injection at browser start so it's too early to ping them
        if (tab.status === 'loading') {
          busyTabs.add(tab.id);
        } else {
          injectToTab({
            url: tab.url,
            tabId: tab.id
          });
        }
      }
      if (busyTabs.size) {
        chrome.tabs.onUpdated.addListener(function _(tabId, {status}, {url}) {
          if (status === 'complete' && busyTabs.has(tabId)) {
            busyTabs.delete(tabId);
            if (!busyTabs.size) chrome.tabs.onUpdated.removeListener(_);
            injectToTab({tabId, url});
          }
        });
      }
    });
  }
})();
