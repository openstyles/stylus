import {kApplyPort} from '@/js/consts';
import {onDisconnect} from '@/js/msg';
import {supported} from '@/js/urls';
import {ignoreChromeError} from '@/js/util-webext';
import {bgBusy, bgInit, onUnload, onUrl} from './common';
import {stateDB} from './db';
import {onUrlChange} from './navigation-manager';

/** @typedef {{ url:string, styleIds: {[frameId:string]: number[]} }} StyleIdsFrameMap */
/** @type {Map<number,{ id: number, url:string, styleIds: StyleIdsFrameMap }>} */
const cache = new Map();
export default cache;

export const get = (tabId, ...keyPath) => {
  let res = cache.get(tabId);
  for (let i = 0; res && i < keyPath.length; i++) res = res[keyPath[i]];
  return res;
};

/** @return {StyleIdsFrameMap|false} */
export const getStyleIds = id => cache.get(id)?.styleIds || false;

export const load = async tabId => {
  const oldVal = __.MV3 && await stateDB.get(tabId);
  const val = oldVal || {
    id: tabId,
    url: (await browser.tabs.get(tabId).catch(ignoreChromeError))?.url,
  };
  cache.set(tabId, val);
  if (__.MV3 && !oldVal) stateDB.put(val, tabId);
  return val;
};

/**
 * number of keys is arbitrary, last arg is value, `undefined` will delete the last key from meta
 * (tabId, 'foo', 123) will set tabId's meta to {foo: 123},
 * (tabId, 'foo', 'bar', 'etc', 123) will set tabId's meta to {foo: {bar: {etc: 123}}}
 */
export const set = (tabId, ...args) => {
  const value = args.pop();
  const lastKey = args.pop();
  const del = value === undefined;
  let obj = cache.get(tabId);
  let obj0 = obj;
  if (!obj) {
    if (del) return;
    cache.set(tabId, obj = obj0 = {});
  }
  for (let i = 0, key; obj && i < args.length; i++) {
    obj = obj[key = args[i]] || !del && (obj[key] = {});
  }
  if (!del) obj[lastKey] = value;
  else if (obj) delete obj[lastKey];
  if (__.MV3) {
    obj0.id = tabId;
    stateDB.put(obj0, tabId);
  }
};

export const someInjectable = () => {
  for (const v of cache.values()) {
    if (v.styleIds || supported(v.url)) {
      return true;
    }
  }
};

export const remove = tabId => {
  cache.delete(tabId);
  if (__.MV3) stateDB.delete(tabId);
};

bgInit.push(async () => {
  const [dbData, tabs] = await Promise.all([
    __.MV3 ? stateDB.getAll(IDBKeyRange.bound(0, Number.MAX_SAFE_INTEGER)) : [],
    browser.tabs.query({}),
  ]);
  const tabsObj = {};
  const dbMap = new Map();
  for (const val of dbData) dbMap.set(val.id, val);
  for (const tab of tabs) tabsObj[tab.id] = tab;
  for (const {id, url} of tabs) {
    if (supported(url)) {
      let data = __.MV3 && dbMap.get(id);
      if (!data ? data = {id} : data.url !== url) {
        data.url = url;
        if (__.MV3) stateDB.put(data, id);
      }
      cache.set(id, data);
    }
  }
  if (__.MV3) {
    for (const key of dbMap.keys()) {
      if (!cache.has(key)) stateDB.delete(key);
    }
  }
});

bgBusy.then(() => {
  onUrlChange.add(({tabId, frameId, url}) => {
    if (frameId) return;
    let obj, oldUrl;
    if ((obj = cache.get(tabId))) oldUrl = obj.url;
    else cache.set(tabId, obj = {});
    obj.id = tabId;
    obj.url = url;
    if (__.MV3) stateDB.put(obj, tabId);
    for (const fn of onUrl) fn(tabId, url, oldUrl);
  });
});

onDisconnect[kApplyPort] = onPortDisconnected;

// Wake up when a new empty is created to ensure the styles are preloaded
chrome.tabs.onCreated.addListener(() => {});

chrome.tabs.onRemoved.addListener(async tabId => {
  if (bgBusy) await bgBusy;
  remove(tabId);
  for (const fn of onUnload) fn(tabId, 0);
});

async function onPortDisconnected(port) {
  ignoreChromeError();
  if (bgBusy) await bgBusy;
  const {sender} = port;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  for (const fn of onUnload) fn(tabId, frameId, port);
}
