import '../intro'; // sets global.API
import './keep-alive'; // sets global.keepAlive
import {kMainFrame, kSubFrame} from '@/js/consts';
import {_execute} from '@/js/msg';
import {initRemotePort} from '@/js/port';
import {ownRoot} from '@/js/urls';
import {clientDataJobs} from '../common';
import {cloudDrive} from '../db-to-cloud-broker';
import setClientData from '../set-client-data';
import offscreen from '../offscreen';
import '..';

if (__.DEBUG) {
  global.onunhandledrejection = global.onerror = e => {
    e = e.reason || e.error || e;
    chrome.tabs.create({url: 'data:,' + (e.stack || e.message || `${e}`)});
  };
}

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
    const job = setClientData({dark, url: pageUrl});
    clientDataJobs.set(pageUrl, job);
    job.finally(() => clientDataJobs.delete(pageUrl));
    evt.respondWith(job);
  } else if (/\.user.css#(\d+)$/.test(url)) {
    evt.respondWith(Response.redirect('edit.html?id=' + RegExp.$1));
  }
};

// API
global.onmessage = initRemotePort.bind(_execute);

cloudDrive.webdav = async cfg => {
  const res = await offscreen.webdavInit(cfg);
  const webdav = offscreen.webdav;
  for (const k in res) res[k] ??= webdav.bind(null, k);
  return res;
};

/**
 * This ensures that SW starts even before our page makes a clientData request inside.
 * The actual listener is usually invoked after `onfetch`, but there's no guarantee.
 */
chrome.webRequest.onBeforeRequest.addListener(() => {}, {
  urls: [ownRoot + '*.html*'],
  types: [kMainFrame, kSubFrame],
});
