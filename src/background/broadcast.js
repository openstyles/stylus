import '@/js/browser';
import {pExposeIframes, pStyleViaASS} from '@/js/consts';
import {rxIgnorableError} from '@/js/msg-api';
import {ownRoot} from '@/js/urls';
import {sleep0} from '@/js/util';
import {isOptionSite, optionSites} from './option-sites';
import {getWindowClients} from './util';

let toBroadcast;

export function broadcast(data) {
  toBroadcast ??= (setTimeout(doBroadcast), []);
  toBroadcast.push(data);
}

async function doBroadcast() {
  const [clients, tabs] = await Promise.all([
    __.MV3 && getWindowClients(), // TODO: detect the popup in Chrome MV2 incognito window?
    browser.tabs.query({}),
  ]);
  const data = toBroadcast;
  const {cfg} = data;
  const assSites = cfg?.ass && optionSites[pStyleViaASS];
  const iframeSites = cfg?.top && optionSites[pExposeIframes];
  toBroadcast = null;
  if (!__.MV3 || clients[0])
    broadcastExtension(data, true);
  let cnt = 0;
  let url;
  tabs.sort((a, b) => b.active - a.active); // start with active tabs in all windows
  for (const t of tabs) {
    if (!t.discarded && (url = t.url) && !url.startsWith(ownRoot)) {
      if (assSites) cfg.ass = isOptionSite(assSites, url);
      if (iframeSites) cfg.top = isOptionSite(iframeSites, url);
      sendTab(t.id, data, null, true);
      /* Broadcast messages are tiny, but sending them takes some time anyway,
         so we're yielding for a possible navigation/messaging event. */
      if (++cnt > 50) {
        cnt = 0;
        await sleep0();
      }
    }
  }
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
