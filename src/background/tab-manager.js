import {kApplyPort, kStyleIds, kUrl, pKeepAlive} from '@/js/consts';
import {onDisconnect} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {supported} from '@/js/urls';
import {ignoreChromeError} from '@/js/util-webext';
import {bgBusy, bgInit, onTabUrlChange, onUnload, onUrlChange} from './common';
import {stateDB} from './db';
import {kCommitted} from './navigation-manager';

const cache = {__proto__: null};
export default cache;

export const get = (tabId, ...keyPath) => {
  let res = cache[tabId];
  for (let i = 0; res && i < keyPath.length; i++) res = res[keyPath[i]];
  return res;
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
  let obj = cache[tabId];
  let obj0 = obj;
  if (!obj) {
    if (del) return;
    cache[tabId] = obj = obj0 = {};
  }
  for (let i = 0, key; obj && i < args.length; i++) {
    obj = obj[key = args[i]] || !del && (obj[key] = {});
  }
  if (!del) obj[lastKey] = value;
  else if (obj) delete obj[lastKey];
  if (__.MV3 && bgMortal) stateDB.put(obj0, tabId);
  return value;
};

export const someInjectable = () => {
  for (let v in cache) {
    v = cache[v];
    if (v[kStyleIds] || (v = v[kUrl]) && supported(v[0])) {
      return true;
    }
  }
};

export const remove = tabId => {
  delete cache[tabId];
  if (__.MV3 && bgMortal) stateDB.delete(tabId);
};

const putObject = obj => stateDB.putMany(
  Object.values(obj),
  Object.keys(obj).map(Number)
);

export const bgMortalChanged = __.MV3 && new Set();
let bgMortal;

bgInit.push(async () => {
  const [saved, tabs] = await Promise.all([
    __.MV3 && (bgMortal = prefs.__values[pKeepAlive] >= 0)
      && stateDB.getAll(IDBKeyRange.bound(0, 1e99)),
    browser.tabs.query({}),
  ]);
  let toPut;
  for (const {id, url} of tabs) {
    let data;
    if (!__.MV3 || !saved || !(data = saved[id]) || data[kUrl]?.[0] !== url) {
      data = {[kUrl]: {0: url}};
      if (__.MV3 && saved)
        (toPut ??= {})[id] = data;
    }
    cache[id] = data;
  }
  if (__.MV3) {
    if (saved) {
      let toDel;
      for (const id in saved)
        if (!cache[id])
          (toDel ??= []).push(id);
      if (toDel) stateDB.deleteMany(toDel);
      if (toPut) putObject(toPut);
    }
    prefs.subscribe(pKeepAlive, (key, val) => {
      val = val >= 0;
      if (bgMortal !== val) {
        bgMortal = val;
        if (val) putObject(cache);
        else stateDB.delete(IDBKeyRange.bound(0, 1e99));
        for (const fn of bgMortalChanged) fn(val);
      }
    });
  }
});

bgBusy.then(() => {
  onUrlChange.add(({tabId, frameId, url}, navType) => {
    let obj, oldUrl;
    if ((obj = cache[tabId])) {
      oldUrl = obj[kUrl]?.[0];
      if (navType === kCommitted && obj[kStyleIds]) {
        if (frameId) delete obj[kStyleIds][frameId];
        else delete obj[kStyleIds];
      }
    } else {
      cache[tabId] = obj = {};
    }
    if (navType === kCommitted && !frameId)
      obj[kUrl] = {0: url};
    else
      (obj[kUrl] ??= {})[frameId] = url;
    if (__.MV3 && bgMortal)
      stateDB.put(obj, tabId);
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
