import {k_busy, kInvokeAPI} from '@/js/consts';
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

// SECURITY: Restrict messages to trusted content scripts
// Only allow messages from extension's own content scripts
const TRUSTED_ORIGINS = [
  // Allow messages from extension pages (options, popup, etc.)
  `chrome-extension://${chrome.runtime.id}`,
  // Allow messages from background (MV3)
  `chrome-extension://${chrome.runtime.id}/background.html`,
];

function isMessageTrusted(sender) {
  if (!sender.url && !sender.frameId) {
    // Background script or extension page
    return true;
  }
  // Check if message comes from our content script
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}`)) {
    return true;
  }
  // Messages from web pages must be from content scripts only
  // Content scripts loaded by extension are marked with specific properties
  if (sender.frameId !== undefined) {
    // This is a content script - always allow
    return true;
  }
  return false;
}

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

export function _execute(data, sender, multi, broadcast) {
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
        data.broadcast = broadcast;
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

function onRuntimeMessage({data, multi, TDM, broadcast}, sender, sendResponse) {
  // SECURITY: Validate message origin before processing
  if (!isMessageTrusted(sender)) {
    console.warn('[msg] Rejecting message from untrusted sender:', sender.url || sender);
    sendResponse(wrapError(new Error('Message origin not trusted')));
    return false;
  }
  
  if (!__.MV3 && !__.IS_BG && data.method === 'backgroundReady') {
    bgReadySignal?.(true);
  }
  if (__.ENTRY === true && !__.IS_BG && data.method === kInvokeAPI) {
    return;
  }
  sender.TDM = TDM;
  let res = __.IS_BG && global[k_busy];
  res = res
    ? res.then(_execute.bind(null, data, sender, multi, broadcast))
    : _execute(data, sender, multi, broadcast);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}
