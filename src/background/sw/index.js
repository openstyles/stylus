import '../intro'; // sets global.API
import './keep-alive'; // sets global.keepAlive
import {kMainFrame, kSubFrame} from '@/js/consts';
import {_execute, API} from '@/js/msg';
import {CONNECTED, createPortProxy, initRemotePort} from '@/js/port';
import * as prefs from '@/js/prefs';
import {clientUrls, ownRoot, workerPath} from '@/js/urls';
import {setSystemDark} from '../color-scheme';
import {bgBusy, bgPreInit} from '../common';
import {cloudDrive} from '../db-to-cloud-broker';
import setClientData from '../set-client-data';
import offscreen, {getOffscreenClient, getWindowClients} from './offscreen';
import '..';

/** @param {ExtendableEvent} evt */
global.oninstall = evt => {
  evt.addRoutes({
    condition: {urlPattern: `${ownRoot}*.html?clientData*`},
    source: 'fetch-event',
  });
  evt.addRoutes({
    condition: {not: {urlPattern: `${ownRoot}*.user.css`, requestDestination: 'document'}},
    source: 'network',
  });
};

/** @param {FetchEvent} evt */
global.onfetch = evt => {
  __.DEBUGLOG('onfetch', evt.request, evt);
  const url = evt.request.url;
  if (!url.startsWith(ownRoot)) {
    return; // shouldn't happen but addRoutes may be bugged
  }
  if (url.includes('?clientData')) {
    const sp = new URL(url).searchParams;
    const dark = !!+sp.get('dark');
    const pageUrl = sp.get('url');
    clientUrls[pageUrl] = true;
    evt.respondWith(setClientData({dark, url: pageUrl})
      .finally(() => delete clientUrls[pageUrl]));
  } else if (/\.user.css#(\d+)$/.test(url)) {
    evt.respondWith(Response.redirect('edit.html?id=' + RegExp.$1));
  }
};

// API
global.onmessage = initRemotePort.bind(_execute.bind(null, 'extension'));

/** @type {CommandsAPI} */
API.client = createPortProxy(async () => await getClient() || getOffscreenClient(), {once: true});

API.worker = createPortProxy(async () => {
  const client = await getClient();
  const proxy = client ? createPortProxy(client, {once: true}) : offscreen;
  return proxy.getWorkerPort(workerPath);
}, {lock: workerPath});

cloudDrive.webdav = async cfg => {
  const res = await offscreen.webdavInit(cfg);
  const webdav = offscreen.webdav;
  for (const k in res) res[k] ??= webdav.bind(null, k);
  return res;
};

prefs.subscribe('styleViaXhr', (key, val) => {
  if (val || offscreen[CONNECTED]) {
    offscreen.keepAlive(val);
  }
}, true);

// not using bgPreInit because we can't reliably exclude the onfetch client
bgBusy.then(() => API.client.isDark().then(setSystemDark));

/**
 * This ensures that SW starts even before our page makes a clientData request inside.
 * The actual listener is usually invoked after `onfetch`, but there's no guarantee.
 */
chrome.webRequest.onBeforeRequest.addListener(req => {
  clientUrls[req.url] = true;
}, {
  urls: [ownRoot + '*.html*'],
  types: [kMainFrame, kSubFrame],
});

async function getClient() {
  if (bgBusy) await Promise.all(bgPreInit);
  for (const client of await getWindowClients()) {
    if (!clientUrls[client.url]) {
      return client;
    }
  }
}
