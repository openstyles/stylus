import {k_onDisconnect, kInvokeAPI} from '@/js/consts';
import {bgReadySignal} from './msg-api';

const handlers = new Map();
export const onConnect = {};
export const onDisconnect = {};
export const onMessage = (fn, replyAllowed) => {
  handlers.set(fn, replyAllowed);
};
export const off = fn => {
  handlers.delete(fn);
};
export const wrapData = data => ({
  data,
});
export const wrapError = error => ({
  error: Object.assign({
    message: error.message || `${error}`,
    stack: error.stack,
  }, error), // passing custom properties e.g. `error.index`
});

chrome.runtime.onMessage.addListener(onRuntimeMessage);
if (__.ENTRY) {
  global[k_onDisconnect] = onDisconnect;
  chrome.runtime.onConnect.addListener(port => {
    const name = port.name.split(':', 1)[0];
    const fnOn = onConnect[name];
    const fnOff = onDisconnect[name];
    if (fnOn) fnOn(port);
    if (fnOff) port.onDisconnect.addListener(fnOff);
  });
}

export function _execute(data, sender, multi) {
  let result;
  let res;
  let i = 0;
  if (__.ENTRY !== 'sw' && multi) {
    data = (multi = data)[0];
  }
  do {
    for (const [fn, replyAllowed] of handlers) {
      try {
        res = fn(data, sender, !!multi);
      } catch (err) {
        res = Promise.reject(err);
      }
      if (replyAllowed && res !== result && result === undefined) {
        result = res;
      }
    }
  } while (__.ENTRY !== 'sw' && multi && (data = multi[++i]));
  return result;
}

function onRuntimeMessage({data, multi, TDM}, sender, sendResponse) {
  if (!__.MV3 && !__.IS_BG && data.method === 'backgroundReady') {
    bgReadySignal?.(true);
  }
  if (__.ENTRY === true && !__.IS_BG && data.method === kInvokeAPI) {
    return;
  }
  sender.TDM = TDM;
  const res = _execute(data, sender, multi);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}
