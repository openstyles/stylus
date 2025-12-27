import {kInvokeAPI, kSidebar} from '@/js/consts';

export const FF = __.BUILD !== 'chrome' && (
  __.ENTRY
    ? 'contextualIdentities' in chrome || 'activityLog' in chrome
    : global !== window
);
export const rxIgnorableError = /(R)eceiving end does not exist|The message (port|channel) closed|moved into back\/forward cache/;

export const apiHandler = !__.IS_BG && {
  get: (obj, key) => (obj[key] ??= new Proxy(
    Object.defineProperty(() => {}, 'name', {value: obj.name ? obj.name + '.' + key : key}),
    apiHandler)),
  apply: apiSendProxy,
};
/** @typedef {{}} API */
/** @type {API} */
export const API = __.IS_BG
  ? global[__.API]
  : global[__.API] = new Proxy({name: ''}, apiHandler);
export const isFrame = !__.IS_BG && window !== top;
export let isTab;

export let bgReadySignal;
let bgReadying = !__.MV3 && new Promise(fn => (bgReadySignal = fn));
/** @type {number} top document mode
 * -1 = top prerendered, 0 = iframe, 1 = top, 2 = top reified */
export let TDM = __.ENTRY === 'offscreen' ? 1
  : isFrame ? 0
    : !__.IS_BG && document.prerendering ? -1 : 1;

if (__.ENTRY !== true) {
  isTab = !__.ENTRY;
} else if (__.MV3) {
  isTab = global[__.CLIENT_DATA].tabId >= 0;
} else if (new URLSearchParams(location.search).has(kSidebar)) {
  isTab = false;
} else if (!(
  isTab = location.pathname !== '/popup.html'
  // check if the popup was opened in a tab for whatever reason
)) chrome.tabs.getCurrent(tab => {
  isTab = !!tab;
});

export function updateTDM(value) {
  TDM = value;
}

export async function apiSendProxy({name: path}, thisObj, args) {
  const localErr = new Error();
  const msg = {data: {method: kInvokeAPI, path, args}, TDM};
  for (let res, err, retry = 0; retry < (__.MV3 ? 1 : 2); !__.MV3 && retry++) {
    try {
      if (__.MV3 || FF) {
        res = await (__.MV3 ? chrome : browser).runtime.sendMessage(msg);
      } else {
        res = await new Promise((resolve, reject) =>
          chrome.runtime.sendMessage(msg, res2 =>
            ((err = chrome.runtime.lastError)) ? reject(err) : resolve(res2)));
      }
      if (res) {
        if (!__.MV3)
          bgReadying = bgReadySignal = null;
        if ((err = res.error)) {
          err.stack += '\n' + localErr.stack;
          throw err;
        } else {
          return res.data;
        }
      }
    } catch (e) {
      if (!bgReadying) {
        e.stack = localErr.stack;
        throw e;
      }
    }
    if (!__.MV3 && retry) {
      throw new Error('Stylus could not connect to the background script.');
    }
    if (!__.MV3)
      await bgReadying;
  }
}
