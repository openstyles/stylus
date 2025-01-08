import '@/js/browser';
import {getWindowClients} from '@/background/common';
import {rxIgnorableError} from '@/js/msg-api';
import {ownRoot, supported} from '@/js/urls';
import {getActiveTab} from '@/js/util-webext';
import tabCache, * as tabMan from './tab-manager';

let /**@type{?[]}*/toBroadcast;
let /**@type{boolean[]}*/toBroadcastStyled;
let broadcasting;

/**
 * @param {?} data
 * @param {{}} [opts]
 * @param {boolean} [opts.onlyIfStyled] - only tabs that are known to contain styles
 * @param {(tab?:Tab)=>?} [opts.getData] - provides data for this tab, nullish result = skips tab
 * @return {Promise<?[]>}
 */
export function broadcast(data, {onlyIfStyled, getData} = {}) {
  if (getData && !(data = getData())) {
    return;
  }
  (toBroadcast ??= []).push(data);
  (toBroadcastStyled ??= []).push(!!onlyIfStyled);
  broadcasting ??= setTimeout(doBroadcast);
}

async function doBroadcast() {
  const jobs = [];
  const nStyled = toBroadcastStyled.indexOf(false);
  const bAllStyled = nStyled < 0;
  const [client, tabs, activeTab] = await Promise.all([
    !__.MV3 || getWindowClients(), // TODO: detect the popup in Chrome MV2 incognito window?
    bAllStyled ? [] : browser.tabs.query({}),
    bAllStyled && tabMan.someInjectable() && getActiveTab(),
  ]);
  const data = toBroadcast;
  const styled = toBroadcastStyled;
  toBroadcast = toBroadcastStyled = broadcasting = null;
  let msgUnstyled, msgStyled;
  // filter supported tabs in-place and move the active tab to the beginning
  let tabsLen = 0;
  if (!bAllStyled) {
    for (let i = 0, t, url; i < tabs.length; i++) {
      t = tabs[i];
      if (t.discarded || !(url = t.url) || url.startsWith(ownRoot) || !supported(t.url)) {
        continue;
      }
      if (i && t.active) {
        tabs[tabsLen] = tabs[0];
        tabs[0] = t.id;
      } else {
        tabs[tabsLen] = t.id;
      }
      tabsLen++;
    }
    tabs.length = tabsLen;
  } else if (activeTab) {
    tabsLen = tabs.push(activeTab.id);
    for (const t of tabCache.values()) {
      if (t.id !== activeTab.id && t.styleIds) {
        tabsLen = tabs.push(t.id);
      }
    }
  }
  if (client) {
    jobs.push(broadcastExtension(data, true));
  } else if (!tabsLen) {
    return;
  }
  for (const tabId of tabs) {
    const msg = !nStyled || tabMan.getStyleIds(tabId)
      ? msgStyled ??= data
      : msgUnstyled ??= data.filter((v, i) => !styled[i]);
    if (jobs.push(sendTab(tabId, msg, undefined, true)) > 20) {
      await Promise.all(jobs.splice(0));
    }
  }
  await Promise.all(jobs);
}

export function broadcastExtension(data, multi) {
  if (multi && !(multi = data.length > 1)) data = data[0];
  return unwrap(browser.runtime.sendMessage({data, multi}));
}

export function pingTab(tabId, frameId = 0) {
  return sendTab(tabId, {method: 'ping'}, {frameId});
}

export function sendTab(tabId, data, options, multi) {
  if (multi && !(multi = data.length > 1)) data = data[0];
  return unwrap(browser.tabs.sendMessage(tabId, {data, multi}, options), multi);
}

async function unwrap(promise, multi) {
  const err = new Error();
  let data, error;
  try {
    ({data, error} = await promise || {});
    if (!error) return data;
  } catch (e) {
    error = e;
    if (rxIgnorableError.test(err.message = e.message)) {
      return;
    }
  }
  if (error.stack)
    err.stack = error.stack + '\n' + err.stack;
  if (multi) {
    console.error(err);
    return data;
  }
  return Promise.reject(err);
}
