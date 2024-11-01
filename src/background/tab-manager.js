import {supported} from '/js/urls';
import {bgReady} from './common';
import {onUrlChange} from './navigation-manager';
import * as stateDb from './state-db';

const listeners = new Set();
/** @typedef {{ url:string, styleIds: {[frameId:string]: number[]} }} StyleIdsFrameMap */
/** @type {Map<number,{ url:string, styleIds: StyleIdsFrameMap }>} */
const cache = new Map();

export const onOff = (fn, state = true) => {
  listeners[state ? 'add' : 'delete'](fn);
};

export const get = (tabId, ...keyPath) => {
  let res = cache.get(tabId);
  for (let i = 0; res && i < keyPath.length; i++) res = res[keyPath[i]];
  return res;
};

/** @return {StyleIdsFrameMap|false} */
export const getStyleIds = id => cache.get(id)?.styleIds || false;

/** @type {typeof Map.prototype.entries} */
export const entries = /*@__PURE__*/cache.entries.bind(cache);

/** @type {typeof Map.prototype.keys} */
export const keys = /*@__PURE__*/cache.keys.bind(cache);

/**
 * number of keys is arbitrary, last arg is value, `undefined` will delete the last key from meta
 * (tabId, 'foo', 123) will set tabId's meta to {foo: 123},
 * (tabId, 'foo', 'bar', 'etc', 123) will set tabId's meta to {foo: {bar: {etc: 123}}}
 */
export const set = (tabId, ...args) => {
  const value = args.pop();
  const lastKey = args.pop();
  const del = value === undefined;
  let meta = cache.get(tabId);
  if (!meta) {
    if (del) return;
    cache.set(tabId, meta = {});
  }
  stateDb.set(tabId, meta);
  for (let i = 0, key; meta && i < args.length; i++) {
    meta = meta[key = args[i]] || !del && (meta[key] = {});
  }
  if (!del) meta[lastKey] = value;
  else if (meta) delete meta[lastKey];
};

const deleteKey = tabId => {
  cache.delete(tabId);
  stateDb.del(tabId);
};

bgReady.then(() => {
  onUrlChange(({tabId, frameId, url}) => {
    if (frameId) return;
    let obj, oldUrl;
    if ((obj = cache.get(tabId))) oldUrl = obj.url;
    else cache.set(tabId, obj = {});
    obj.url = url;
    if (!supported(url)) return;
    for (const fn of listeners) {
      try {
        fn({tabId, url, oldUrl});
      } catch (err) {
        console.error(err);
      }
    }
  });
});

stateDb.ready?.then(([dbData, tabs]) => {
  const tabIds = tabs.length !== dbData.size && new Set();
  for (const {id, url} of tabs) {
    const data = dbData.get(id) || {};
    cache.set(id, data);
    if (data.url !== url) stateDb.set(id, data).url = url;
    if (tabIds) tabIds.add(id);
  }
  if (tabIds) {
    for (const key of dbData.keys()) {
      if (!tabIds.has(key)) stateDb.del(key);
    }
  }
  chrome.tabs.onRemoved.addListener(deleteKey);
  chrome.tabs.onReplaced.addListener((added, removed) => deleteKey(removed));
});
