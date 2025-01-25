import {kApplyPort, kStyleIds, kUrl} from '@/js/consts';
import {onDisconnect} from '@/js/msg';
import {supported} from '@/js/urls';
import {ignoreChromeError} from '@/js/util-webext';
import {bgBusy, bgInit, onUnload, onTabUrlChange, onUrlChange} from './common';
import {stateDB} from './db';
import {kCommitted} from './navigation-manager';

/** @typedef {{ url:string, styleIds: {[frameId:string]: number[]} }} StyleIdsFrameMap */
/** @type {Map<number,{ id: number, nonce:Object, url:Object, styleIds: StyleIdsFrameMap }>} */
const cache = new Map();
export default cache;

export const get = (tabId, ...keyPath) => {
  let res = cache.get(tabId);
  for (let i = 0; res && i < keyPath.length; i++) res = res[keyPath[i]];
  return res;
};

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
  return value;
};

export const someInjectable = () => {
  for (let v of cache.values()) {
    if (v[kStyleIds] || (v = v[kUrl]) && supported(v[0])) {
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
      if (!data || data[kUrl]?.[0] !== url) {
        data = {id, [kUrl]: {0: url}};
        if (__.MV3) stateDB.put(data, id);
      }
      cache.set(id, data);
    }
  }
  if (__.MV3) {
    const toDel = [...dbMap.keys()].filter(k => !cache.has(k));
    if (toDel.length) stateDB.deleteMany(toDel);
  }
});

bgBusy.then(() => {
  onUrlChange.add(({tabId, frameId, url}, navType) => {
    let obj, oldUrl;
    if ((obj = cache.get(tabId))) {
      oldUrl = obj[kUrl]?.[0];
      if (navType === kCommitted && obj[kStyleIds]) {
        if (frameId) delete obj[kStyleIds][frameId];
        else delete obj[kStyleIds];
      }
    } else {
      cache.set(tabId, obj = {id: tabId});
    }
    if (navType === kCommitted && !frameId)
      obj[kUrl] = {0: url};
    else
      (obj[kUrl] ??= {})[frameId] = url;
    if (__.MV3) stateDB.put(obj, tabId);
    if (frameId) return;
    for (const fn of onTabUrlChange) fn(tabId, url, oldUrl);
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

function onPortDisconnected(port) {
  ignoreChromeError();
  const {sender} = port;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (!frameId) return; // ignoring unload of previous page while navigating to a new URL
  for (const fn of onUnload) fn(tabId, frameId, port);
}
