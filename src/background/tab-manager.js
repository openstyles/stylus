import {kApplyPort} from '/js/consts';
import {supported} from '/js/urls';
import {ignoreChromeError} from '/js/util-webext';
import {bgBusy, bgInit, bgPreInit, stateDB} from './common';
import {onUrlChange} from './navigation-manager';

export const onUnload = new Set();
export const onUrl = new Set();
/** @typedef {{ url:string, styleIds: {[frameId:string]: number[]} }} StyleIdsFrameMap */
/** @type {Map<number,{ url:string, styleIds: StyleIdsFrameMap }>} */
const cache = new Map();

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

export const load = async tabId => {
  const oldVal = process.env.MV3 && await stateDB.get(tabId);
  const val = oldVal || {
    id: tabId,
    url: (await browser.tabs.get(tabId).catch(ignoreChromeError))?.url,
  };
  cache.set(tabId, val);
  if (process.env.MV3 && !oldVal) stateDB.put(val, tabId);
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
  if (process.env.MV3) {
    obj0.id = tabId;
    stateDB.put(obj0, tabId);
  }
};

export const remove = tabId => {
  cache.delete(tabId);
  if (process.env.MV3) stateDB.delete(tabId);
};

bgInit.push(async () => {
  const [dbData, tabs] = await Promise.all([
    process.env.MV3 ? stateDB.getAll(IDBKeyRange.bound(0, Number.MAX_SAFE_INTEGER)) : [],
    chrome.tabs.query({}),
  ]);
  const tabsObj = {};
  const dbMap = new Map();
  for (const val of dbData) dbMap.set(val.id, val);
  for (const tab of tabs) tabsObj[tab.id] = tab;
  for (const {id, url} of tabs) {
    if (supported(url)) {
      let data = process.env.MV3 && dbMap.get(id);
      if (!data ? data = {id} : data.url !== url) {
        data.url = url;
        if (process.env.MV3) stateDB.put(data, id);
      }
      cache.set(id, data);
    }
  }
  if (process.env.MV3) {
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
    if (process.env.MV3) stateDB.put(obj, tabId);
    for (const fn of onUrl) fn(tabId, url, oldUrl);
  });
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === kApplyPort) {
    port.onDisconnect.addListener(onPortDisconnected);
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  if (bgBusy) await Promise.all(bgPreInit);
  remove(tabId);
  for (const fn of onUnload) fn(tabId, 0);
});

async function onPortDisconnected(port) {
  ignoreChromeError();
  process.env.DEBUGLOG(port.sender);
  if (bgBusy) await Promise.all(bgPreInit);
  const {sender} = port;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  for (const fn of onUnload) fn(tabId, frameId, port);
}
