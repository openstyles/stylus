import '@/js/browser';
import {rxIgnorableError} from '@/js/msg-api';
import {ownRoot} from '@/js/urls';
import * as tabMan from './tab-manager';

/**
 * @param {?} data
 * @param {{}} [opts]
 * @param {boolean} [opts.onlyIfStyled] - only tabs that are known to contain styles
 * @param {(tab?:Tab)=>?} [opts.getData] - provides data for this tab, nullish result = skips tab
 * @return {Promise<?[]>}
 */
export async function broadcast(data, {onlyIfStyled, getData} = {}) {
  const jobs = [];
  if (!getData || (data = getData())) {
    jobs.push(broadcastExtension(data));
  }
  const tabs = (await browser.tabs.query({})).sort((a, b) => b.active - a.active);
  for (const tab of tabs) {
    if (!tab.discarded &&
      // including tabs with unsupported `url` as they may contain supported iframes
      (!onlyIfStyled || tabMan.getStyleIds(tab.id)) &&
      // own tabs are informed via broadcastExtension
      !(tab.pendingUrl || tab.url || '').startsWith(ownRoot) &&
      (!getData || (data = getData(tab)))
    ) {
      jobs.push(sendTab(tab.id, data));
    }
  }
  return Promise.all(jobs);
}

export function broadcastExtension(data) {
  return unwrap(browser.runtime.sendMessage({data}));
}

export function pingTab(tabId, frameId = 0) {
  return sendTab(tabId, {method: 'ping'}, {frameId});
}

export function sendTab(tabId, data, options) {
  return unwrap(browser.tabs.sendMessage(tabId, {data}, options));
}

async function unwrap(promise) {
  const err = new Error();
  let data, error;
  try {
    ({data, error} = await promise || {});
    if (!error) return data;
  } catch (e) {
    error = e;
    if (rxIgnorableError.test(err.message = e.message)) {
      return data;
    }
  }
  if (error.stack) err.stack = error.stack + '\n' + err.stack;
  return Promise.reject(err);
}
