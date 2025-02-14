import '@/js/browser';
import {kBroadcast} from '@/js/consts';
import {rxIgnorableError} from '@/js/msg-api';
import {chromeLocal, chromeSession} from '@/js/storage-util';
import {ownRoot} from '@/js/urls';
import {getWindowClients} from './util';

let toBroadcast;

export function broadcast(data) {
  toBroadcast ??= (setTimeout(__.MV3 ? doBroadcast : doBroadcastMV2), []);
  toBroadcast.push(data);
}

function doBroadcast() {
  toBroadcast.push(Math.random());
  (chromeSession || chromeLocal).set({[kBroadcast]: toBroadcast});
  toBroadcast = null;
}

async function doBroadcastMV2() {
  const jobs = [];
  const [clients, tabs] = await Promise.all([
    __.MV3 && getWindowClients(), // TODO: detect the popup in Chrome MV2 incognito window?
    browser.tabs.query({}),
  ]);
  const iActive = tabs.find(t => t.active);
  const data = toBroadcast;
  toBroadcast = null;
  if (iActive > 0)
    tabs.unshift(tabs.splice(iActive, 1)[0]);
  if (!__.MV3 || clients[0])
    jobs.push(broadcastExtension(data, true));
  for (const {url, id} of tabs)
    if (url && !url.startsWith(ownRoot) && jobs.push(sendTab(id, data, null, true)) > 20)
      await Promise.all(jobs.splice(0));
  await Promise.all(jobs);
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
