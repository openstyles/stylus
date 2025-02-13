import '@/js/browser';
import {kBroadcast} from '@/js/consts';
import {rxIgnorableError} from '@/js/msg-api';
import {chromeLocal, chromeSession} from '@/js/storage-util';

let toBroadcast;

export function broadcast(data) {
  toBroadcast ??= (setTimeout(doBroadcast), []);
  toBroadcast.push(data);
}

function doBroadcast() {
  toBroadcast.push(Math.random());
  (chromeSession || chromeLocal).set({[kBroadcast]: toBroadcast});
  toBroadcast = null;
}

export function broadcastExtension(data, multi) {
  return unwrap(browser.runtime.sendMessage({data, multi}));
}

export function pingTab(tabId, frameId = 0) {
  return sendTab(tabId, {method: 'ping'}, {frameId});
}

export function sendTab(tabId, data, options, multi) {
  return unwrap(browser.tabs.sendMessage(tabId, {data, multi}, options), multi);
}

async function unwrap(promise, multi) {
  const err = new Error();
  let data, error;
  try {
    ({data, error} = await promise || {});
    if (!error) return data;
  } catch (e) {
    error = e;
    if (rxIgnorableError.test(err.message = e.message)) {
      return;
    }
  }
  if (error.stack)
    err.stack = error.stack + '\n' + err.stack;
  if (multi) {
    console.error(err);
    return data;
  }
  return Promise.reject(err);
}
