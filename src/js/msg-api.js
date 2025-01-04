import {kInvokeAPI} from '@/js/consts';

export const FF = __.BUILD !== 'chrome' && (
  __.ENTRY
    ? 'contextualIdentities' in chrome
    : global !== window
);
export const rxIgnorableError = /(R)eceiving end does not exist|The message (port|channel) closed|moved into back\/forward cache/;

export const apiHandler = !__.IS_BG && {
  get: ({name: path}, name) => new Proxy(
    Object.defineProperty(() => {}, 'name', {value: path ? path + '.' + name : name}),
    apiHandler),
  apply: apiSendProxy,
};
/** @typedef {{}} API */
/** @type {API} */
export const API = __.IS_BG
  ? global[__.API]
  : global[__.API] = new Proxy({path: ''}, apiHandler);
export const isFrame = !__.IS_BG && window !== top;

export let bgReadySignal;
let bgReadying = !__.MV3 && new Promise(fn => (bgReadySignal = fn));
/** @type {number} top document mode
 * -1 = top prerendered, 0 = iframe, 1 = top, 2 = top reified */
export let TDM = isFrame ? 0 : !__.IS_BG && document.prerendering ? -1 : 1;

export function updateTDM(value) {
  TDM = value;
}

export async function apiSendProxy({name: path}, thisObj, args) {
  const localErr = new Error();
  const msg = {data: {method: kInvokeAPI, path, args}, TDM};
  for (let res, err, retry = 0; retry < 2; retry++) {
    try {
      if (__.MV3 || FF) {
        res = await (FF ? browser : chrome).runtime.sendMessage(msg);
      } else {
        res = await new Promise((resolve, reject) =>
          chrome.runtime.sendMessage(msg, res2 =>
            ((err = chrome.runtime.lastError)) ? reject(err) : resolve(res2)));
      }
      if (res) {
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
    if (retry) {
      throw new Error('Stylus could not connect to the background script.');
    }
    await bgReadying;
  }
}
