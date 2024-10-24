import {URLS} from '/js/toolbox';
import {bgReady} from './common';
import {onUrlChange} from './navigation-manager';

const listeners = new Set();
/** @typedef {{ url:string, styleIds: {[frameId:string]: number[]} }} StyleIdsFrameMap */
/** @type {Map<number,{ url:string, styleIds: StyleIdsFrameMap }>} */
const cache = new Map();
const cacheGet = cache.get.bind(cache);
const cacheSet = cache.set.bind(cache);

const tabMan = Object.assign(cache, {
  onOff(fn, state = true) {
    listeners[state ? 'add' : 'delete'](fn);
  },
  get(tabId, ...keys) {
    let res = cacheGet(tabId);
    for (let i = 0; res && i < keys.length; i++) res = res[keys[i]];
    return res;
  },
  /** @return {StyleIdsFrameMap|false} */
  getStyleIds: id => (id = cacheGet(id)) && id.styleIds || false,
  /**
   * number of keys is arbitrary, last arg is value, `undefined` will delete the last key from meta
   * (tabId, 'foo', 123) will set tabId's meta to {foo: 123},
   * (tabId, 'foo', 'bar', 'etc', 123) will set tabId's meta to {foo: {bar: {etc: 123}}}
   */
  set(tabId, ...args) {
    const value = args.pop();
    const lastKey = args.pop();
    const del = value === undefined;
    let meta = cacheGet(tabId);
    if (!meta) {
      if (del) return;
      cacheSet(tabId, meta = {});
    }
    for (let i = 0, key; meta && i < args.length; i++) {
      meta = meta[key = args[i]] || !del && (meta[key] = {});
    }
    if (!del) meta[lastKey] = value;
    else if (meta) delete meta[lastKey];
  },
});

chrome.tabs.onRemoved.addListener(tabId => cache.delete(tabId));
chrome.tabs.onReplaced.addListener((added, removed) => cache.delete(removed));
bgReady.then(() => {
  onUrlChange(({tabId, frameId, url}) => {
    if (frameId) return;
    let obj, oldUrl;
    if ((obj = cacheGet(tabId))) oldUrl = obj.url;
    else cacheSet(tabId, obj = {});
    obj.url = url;
    if (!URLS.supported(url)) return;
    for (const fn of listeners) {
      try {
        fn({tabId, url, oldUrl});
      } catch (err) {
        console.error(err);
      }
    }
  });
});

export default tabMan;
