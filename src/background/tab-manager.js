import {kApplyPort, kStyleIds, kUrl} from '@/js/consts';
import {onDisconnect} from '@/js/msg';
import {supported} from '@/js/urls';
import {ignoreChromeError} from '@/js/util-webext';
import {bgBusy, bgInit, onUnload, onTabUrlChange, onUrlChange} from './common';
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
  if (!obj) {
    if (del) return;
    cache[tabId] = obj = {id: tabId};
  }
  for (let i = 0, key; obj && i < args.length; i++) {
    obj = obj[key = args[i]] || !del && (obj[key] = {});
  }
  if (!del) obj[lastKey] = value;
  else if (obj) delete obj[lastKey];
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

bgInit.push(async () => {
  for (const {id, url} of await browser.tabs.query({})) {
    if (supported(url))
      cache[id] = {id, [kUrl]: {0: url}};
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
      cache[tabId] = obj = {id: tabId};
    }
    if (navType === kCommitted && !frameId)
      obj[kUrl] = {0: url};
    else
      (obj[kUrl] ??= {})[frameId] = url;
    if (frameId) return;
    for (const fn of onTabUrlChange) fn(tabId, url, oldUrl);
  });
});

onDisconnect[kApplyPort] = onPortDisconnected;

// Wake up when a new empty is created to ensure the styles are preloaded
chrome.tabs.onCreated.addListener(() => {});

chrome.tabs.onRemoved.addListener(async tabId => {
  if (bgBusy) await bgBusy;
  delete cache[tabId];
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
