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
    get(tabId, ...keys) {
      return keys.reduce((meta, key) => meta && meta[key], cache.get(tabId));
    },
    /**
     * number of keys is arbitrary, last arg is value, `undefined` will delete the last key from meta
     * (tabId, 'foo', 123) will set tabId's meta to {foo: 123},
     * (tabId, 'foo', 'bar', 'etc', 123) will set tabId's meta to {foo: {bar: {etc: 123}}}
     */
    set(tabId, ...args) {
      let meta = cache.get(tabId);
      if (!meta) {
        meta = {};
        cache.set(tabId, meta);
      }
      const value = args.pop();
      const lastKey = args.pop();
      for (const key of args) meta = meta[key] || (meta[key] = {});
      if (value === undefined) {
        delete meta[lastKey];
      } else {
        meta[lastKey] = value;
      }
    },
    list() {
      return cache.keys();
    },
  };
})();
