import '../intro'; // sets global.API
import './keep-alive'; // sets global.keepAlive
import {_execute, API} from '/js/msg';
import {createPortProxy, initRemotePort} from '/js/port';
import {ownRoot, workerPath} from '/js/urls';
import {cloudDrive} from '../db-to-cloud-broker';
import offscreen from './offscreen';
import setClientData from './set-client-data';
import '..';

/** @param {ExtendableEvent} evt */
self.oninstall = evt => {
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
self.onfetch = evt => {
  const url = evt.request.url;
  if (!url.startsWith(ownRoot)) {
    return; // shouldn't happen but addRoutes may be bugged
  }
  if (url.includes('?clientData')) {
    evt.respondWith(setClientData(evt, new URL(url)));
  } else if (/\.user.css#\d+$/.test(url)) {
    evt.respondWith(Response.redirect('edit.html'));
  }
};

// API
self.onmessage = initRemotePort.bind(_execute.bind(null, 'extension'));

API.worker = createPortProxy(async () => {
  const [client] = await self.clients.matchAll({type: 'window'});
  const proxy = client ? createPortProxy(client, {once: true}) : offscreen;
  return proxy.getWorkerPort(workerPath);
}, {lock: workerPath});

cloudDrive.webdav = async cfg => {
  const res = await offscreen.webdavInit(cfg);
  const webdav = offscreen.webdav;
  for (const k in res) res[k] ??= webdav.bind(null, k);
  return res;
};
