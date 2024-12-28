import {API, bgReadySignal} from './msg-api';

export {API};

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

export function _execute(data, sender) {
  let result;
  let res;
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
  return result;
}

function onRuntimeMessage({data, TDM}, sender, sendResponse) {
  if (!__.MV3 && !__.IS_BG && data.method === 'backgroundReady') {
    bgReadySignal?.(true);
  }
  sender.TDM = TDM;
  const res = _execute(data, sender);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}
