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
    setMeta(tabId, 'url', url);
    emitUpdate({tabId, url});
  });

  return {onUpdate, setMeta, getMeta, list};

  function list() {
    return cache.keys();
  }

  function onUpdate(callback) {
    listeners.push(callback);
  }

  function emitUpdate(e) {
    for (const callback of listeners) {
      try {
        callback(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function setMeta(tabId, key, value) {
    let meta = cache.get(tabId);
    if (!meta) {
      meta = new Map();
      cache.set(tabId, meta);
    }
    meta.set(key, value);
  }

  function getMeta(tabId, key) {
    return cache.get(tabId).get(key);
  }
})();
