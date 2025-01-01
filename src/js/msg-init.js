/** Don't use this file in content script context! */
import './browser';
import {k_busy, k_deepCopy, k_msgExec, kInvokeAPI} from '@/js/consts';
import {apiHandler, apiSendProxy} from './msg-api';
import {createPortExec, createPortProxy} from './port';
import {swPath, workerPath} from './urls';
import {deepCopy} from './util';
import {getOwnTab} from './util-webext';

const needsTab = [
  'updateIconBadge',
  'styleViaAPI',
];
/** @type {MessagePort} */
const swExec = __.MV3 &&
  createPortExec(() => navigator.serviceWorker.controller, {lock: swPath});
const workerApiPrefix = 'worker.';
let workerProxy;
export let bg = __.IS_BG ? self : !__.MV3 && chrome.extension.getBackgroundPage();

async function invokeAPI({name: path}, _thisObj, args) {
  // Non-cloneable event is passed when doing `elem.onclick = API.foo`
  if (args[0] instanceof Event) args[0] = 'Event';
  if (path.startsWith(workerApiPrefix)) {
    workerProxy ??= createPortProxy(workerPath);
    return workerProxy[path.slice(workerApiPrefix.length)](...args);
  }
  let tab = false;
  // Using a fake id for our Options frame as we want to fetch styles early
  const frameId = window === top ? 0 : 1;
  if (!needsTab.includes(path) || !frameId && (tab = await getOwnTab())) {
    const msg = {method: kInvokeAPI, path, args};
    const sender = {url: location.href, tab, frameId};
    if (__.MV3) {
      return swExec(msg, sender);
    } else {
      const bgDeepCopy = bg[k_deepCopy];
      const res = bg[k_msgExec](bgDeepCopy(msg), bgDeepCopy(sender));
      return deepCopy(await res);
    }
  }
}

if (__.MV3) {
  if (__.ENTRY !== 'sw') {
    apiHandler.apply = invokeAPI;
  }
} else if (!__.IS_BG) {
  apiHandler.apply = async (fn, thisObj, args) => {
    bg ??= await browser.runtime.getBackgroundPage().catch(() => {}) || false;
    const exec = bg && (bg[k_msgExec] || await bg[k_busy])
      ? invokeAPI
      : apiSendProxy;
    return exec(fn, thisObj, args);
  };
}
