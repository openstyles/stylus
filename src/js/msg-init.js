/** Don't use this file in content script context! */
import './browser';
import {k_busy, k_deepCopy, k_msgExec, kInvokeAPI} from '@/js/consts';
import {_execute} from './msg';
import {apiHandler, apiSendProxy, isPopup} from './msg-api';
import {createPortExec, createPortProxy, initRemotePort} from './port';
import {swPath, workerPath} from './urls';
import {deepCopy} from './util';
import {getOwnTab, ownTab} from './util-webext';

/** falsy: reuse ownTab, truthy: real tab object */
const needsTab = {
  __proto__: null,
  'styles.getSectionsByUrl': 0,
  updateIconBadge: 1,
  styleViaAPI: 1,
};
/** @type {MessagePort} */
const swExec = __.MV3 &&
  createPortExec(() => navigator.serviceWorker.controller, {lock: swPath});
const workerApiPrefix = 'worker.';
let workerProxy;
export let bg = __.IS_BG ? self : !__.MV3 && chrome.extension.getBackgroundPage();
if (!__.IS_BG) {
  initRemotePort.call(_execute, {ports: [new BroadcastChannel('sw')]}, /*silent*/true);
}

async function invokeAPI({name: path}, _thisObj, args) {
  // Non-cloneable event is passed when doing `elem.onclick = API.foo`
  if (args[0] instanceof Event) args[0] = 'Event';
  if (path.startsWith(workerApiPrefix)) {
    workerProxy ??= createPortProxy(workerPath);
    return workerProxy[path.slice(workerApiPrefix.length)](...args);
  }
  // Using a fake id for our Options frame as we want to fetch styles early
  const frameId = window === top ? 0 : 1;
  const tab = isPopup || !(path in needsTab) ? false
    : !needsTab[path] && ownTab || await getOwnTab();
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
