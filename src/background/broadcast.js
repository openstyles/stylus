import '@/js/browser';
import {kTabOvr, pExposeIframes, pStyleViaASS} from '@/js/consts';
import {rxIgnorableError} from '@/js/msg-api';
import {ownRoot} from '@/js/urls';
import {sleep0} from '@/js/util';
import {isOptionSite, optionSites} from './option-sites';
import {cache as tabCache} from './tab-manager';
import {getWindowClients} from './util';

let toBroadcast;
let toBroadcastCfg;
let toBroadcastUpdStyles;
const OLD = Symbol('old');

export function broadcast(data, cfg) {
  toBroadcast ??= (setTimeout(doBroadcast), []);
  if (cfg) {
    toBroadcastCfg = cfg;
  } else if (data.method === 'styleUpdated') {
    (toBroadcastUpdStyles ??= new Map()).set(data.style.id, data);
  } else {
    toBroadcast.push(data);
  }
}

async function doBroadcast() {
  const [clients, tabs] = await Promise.all([
    __.MV3 && getWindowClients(), // TODO: detect the popup in Chrome MV2 incognito window?
    browser.tabs.query({}),
  ]);
  const data = toBroadcast;
  const cfg = toBroadcastCfg;
  const updStyles = toBroadcastUpdStyles;
  const assSites = cfg?.ass && optionSites[pStyleViaASS];
  const iframeSites = cfg?.top && optionSites[pExposeIframes];
  toBroadcastCfg = toBroadcastUpdStyles = toBroadcast = null;
  if (cfg)
    data.push({method: 'injectorConfig', cfg});
  if (updStyles)
    data.push(...updStyles.values());
  if (!__.MV3 || clients[0])
    broadcastExtension(data, true);
  let cnt = 0;
  let url;
  tabs.sort((a, b) => b.active - a.active); // start with active tabs in all windows
  for (const t of tabs) {
    if (t.discarded || !(url = t.url))
      continue;
    const tabOverrides = tabCache[t.id]?.[kTabOvr];
    const patched = tabOverrides && Object.keys(tabOverrides).length &&
      patchStyles(updStyles, tabOverrides);
    if (!url.startsWith(ownRoot) || patched) {
      if (assSites) cfg.ass = isOptionSite(assSites, url);
      if (iframeSites) cfg.top = isOptionSite(iframeSites, url);
      sendTab(t.id, data, null, true);
      if (patched) for (const p of patched) p.enabled = p[OLD];
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
  return unwrap(browser.runtime.sendMessage({data, multi, broadcast: true}));
}

function patchStyles(styleUpdates, tabOverrides) {
  let res, ovr, old;
  for (const {style} of styleUpdates.values()) {
    if ((ovr = tabOverrides[style.id]) != null && ovr !== (old = style.enabled)) {
      style[OLD] = old;
      style.enabled = ovr;
      (res ??= []).push(style);
    }
  }
  return res;
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
