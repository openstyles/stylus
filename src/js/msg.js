import {kInvokeAPI} from '@/js/consts';
import {bgReadySignal} from './msg-api';

const handlers = new Map();
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
        res = fn(data, sender);
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
