import browser from '/js/browser';
import {sendTab, unwrap} from '/js/msg';
import {ownRoot} from '/js/urls';
import tabMan from './tab-manager';

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
    jobs.push(broadcastExtension(data, 'both'));
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

export function broadcastExtension(data, target = 'extension') {
  return unwrap(browser.runtime.sendMessage({data, target}));
}
