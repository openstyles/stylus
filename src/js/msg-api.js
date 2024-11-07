export const FF = process.env.BUILD !== 'chrome' && (
  process.env.ENTRY
    ? 'contextualIdentities' in chrome
    : global !== window
);
export const rxIgnorableError = /(R)eceiving end does not exist|The message port closed|moved into back\/forward cache/;

export const apiHandler = !process.env.IS_BG && {
  get: ({name: path}, name) => new Proxy(
    Object.defineProperty(() => {}, 'name', {value: path ? path + '.' + name : name}),
    apiHandler),
  apply: apiSendProxy,
};
/** @typedef {{}} API */
/** @type {API} */
export const API = process.env.IS_BG
  ? process.env.API
  : process.env.API = new Proxy({path: ''}, apiHandler);
export const isFrame = !process.env.IS_BG && window !== top;

export let bgReadySignal;
let bgReadying = !process.env.MV3 && new Promise(fn => (bgReadySignal = fn));
/** @type {number} -1 = top prerendered, 0 = iframe, 1 = top, 2 = top reified */
export let TDM = isFrame ? 0 // eslint-disable-line prefer-const
  : !process.env.IS_BG && document.prerendering ? -1 : 1;

export async function apiSendProxy({name: path}, thisObj, args) {
  const localErr = new Error();
  const msg = {data: {method: 'invokeAPI', path, args}, TDM};
  for (let res, err, retry = 0; retry < 2; retry++) {
    try {
      if (process.env.MV3 || FF) {
        res = await chrome.runtime.sendMessage(msg);
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
