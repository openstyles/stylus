/** Don't use this file in content script context! */
import browser from './browser';
import {apiHandler, apiSendProxy, isBg, unwrap} from './msg-base';
import {createPortExec, createPortProxy} from './port';
import {deepCopy, getOwnTab, URLS} from './toolbox';

export * from './msg-base';

const needsTab = [
  'updateIconBadge',
  'styleViaAPI',
];
/** @type {MessagePort} */
const swExec = process.env.MV3 &&
  createPortExec(() => navigator.serviceWorker.controller, `/${process.env.PAGE_BG}.js`);
const workerApiPrefix = 'worker.';
export let bg = isBg ? self : !process.env.MV3 && chrome.extension.getBackgroundPage();
let bgWorkerProxy;

async function invokeAPI({name: path}, _thisObj, args) {
  if (path.startsWith(workerApiPrefix)) {
    bgWorkerProxy ??= createPortProxy(URLS.workerPath);
    return bgWorkerProxy[path.slice(workerApiPrefix.length)](...args);
  }
  let tab = false;
  // Using a fake id for our Options frame as we want to fetch styles early
  const frameId = window === top ? 0 : 1;
  if (!needsTab.includes(path) || !frameId && (tab = await getOwnTab())) {
    const msg = {method: 'invokeAPI', path, args};
    const sender = {url: location.href, tab, frameId};
    if (process.env.MV3) {
      return swExec(msg, sender);
    } else {
      const res = bg.msg._execute('extension', bg.deepCopy(msg), bg.deepCopy(sender));
      return deepCopy(await res);
    }
  }
}

export function sendTab(tabId, data, options, target = 'tab') {
  return unwrap(browser.tabs.sendMessage(tabId, {data, target}, options));
}

if (process.env.MV3) {
  if (process.env.PAGE !== 'sw') {
    apiHandler.apply = invokeAPI;
  }
} else if (!isBg) {
  apiHandler.apply = async (fn, thisObj, args) => {
    bg ??= await browser.runtime.getBackgroundPage().catch(() => {}) || false;
    const exec = bg && (bg.msg || await bg.allReady)
      ? invokeAPI
      : apiSendProxy;
    return exec(fn, thisObj, args);
  };
}
