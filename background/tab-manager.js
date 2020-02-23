/* global navigatorUtil */
/* exported tabManager */
'use strict';

const tabManager = (() => {
  const listeners = [];
  const cache = new Map();
  chrome.tabs.onRemoved.addListener(tabId => cache.delete(tabId));
  chrome.tabs.onReplaced.addListener((added, removed) => cache.delete(removed));
  navigatorUtil.onUrlChange(({tabId, frameId, url}) => {
    if (frameId) return;
    const oldUrl = tabManager.get(tabId, 'url');
    tabManager.set(tabId, 'url', url);
    for (const fn of listeners) {
      try {
        fn({tabId, url, oldUrl});
      } catch (err) {
        console.error(err);
      }
    }
  });

  return {
    onUpdate(fn) {
      listeners.push(fn);
    },
    get(tabId, key) {
      const meta = cache.get(tabId);
      return meta && meta[key];
    },
    set(tabId, key, value) {
      let meta = cache.get(tabId);
      if (!meta) {
        meta = {};
        cache.set(tabId, meta);
      }
      meta[key] = value;
    },
    list() {
      return cache.keys();
    },
  };
})();
