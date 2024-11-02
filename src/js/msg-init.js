/** Don't use this file in content script context! */
import './browser';
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
const swExec = process.env.MV3 &&
  createPortExec(() => navigator.serviceWorker.controller, {lock: swPath});
const workerApiPrefix = 'worker.';
let workerProxy;
export let bg = process.env.IS_BG ? self : !process.env.MV3 && chrome.extension.getBackgroundPage();

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
    const msg = {method: 'invokeAPI', path, args};
    const sender = {url: location.href, tab, frameId};
    if (process.env.MV3) {
      return swExec(msg, sender);
    } else {
      const res = bg._msgExec('extension', bg._deepCopy(msg), bg._deepCopy(sender));
      return deepCopy(await res);
    }
  }
}

if (process.env.MV3) {
  if (process.env.ENTRY !== 'sw') {
    apiHandler.apply = invokeAPI;
  }
} else if (!process.env.IS_BG) {
  apiHandler.apply = async (fn, thisObj, args) => {
    bg ??= await browser.runtime.getBackgroundPage().catch(() => {}) || false;
    const exec = bg && (bg._msgExec || await bg._ready)
      ? invokeAPI
      : apiSendProxy;
    return exec(fn, thisObj, args);
  };
}
