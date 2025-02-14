import {k_busy, kBroadcast, kInvokeAPI} from '@/js/consts';
import {bgReadySignal} from './msg-api';

/** @type {Map<function,boolean>} true: returned value is used as the reply */
export const onMessage = new Map();
export const onConnect = {};
export const onDisconnect = {};
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
  chrome.runtime.onConnect.addListener(async port => {
    if (__.IS_BG && global[k_busy]) await global[k_busy];
    const name = port.name.split(':', 1)[0];
    const fnOn = onConnect[name];
    const fnOff = onDisconnect[name];
    if (fnOn) fnOn(port);
    if (fnOff) port.onDisconnect.addListener(fnOff);
  });
}
if (__.MV3 && !__.IS_BG) {
  chrome.storage.session.onChanged.addListener(onStorage);
}

export function _execute(data, sender, multi) {
  let result;
  let res;
  let i = 0;
  if (__.ENTRY !== 'sw' && multi) {
    multi = data.length > 1 && data;
    data = data[0];
  }
  do {
    for (const [fn, replyAllowed] of onMessage) {
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
  let res = __.IS_BG && global[k_busy];
  res = res
    ? res.then(_execute.bind(null, data, sender, multi))
    : _execute(data, sender, multi);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}

async function onStorage(changes) {
  if ((changes = changes[kBroadcast]) && (changes = changes.newValue)) {
    if (document.visibilityState !== 'visible')
      await new Promise(setTimeout);
    changes.pop();
    onRuntimeMessage({data: changes, multi: true}, {}, wrapData);
  }
}
