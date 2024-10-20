// WARNING! /background must be the first to set global.API
import '/background';
import {API, _execute} from '/js/msg';
import {createPortProxy, initRemotePort} from '/js/port';
import {workerPath, ownRoot} from '/js/urls';
import './keep-alive';
import offscreen from './offscreen';
import setClientData from './set-client-data';

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

{ // API
  const exec = _execute.bind(null, 'extension');
  self.onmessage = evt => {
    if (evt.data?.[0] === 'port') {
      initRemotePort(evt, exec);
    }
  };
}

API.worker = createPortProxy(() => offscreen.getWorkerPort(workerPath), workerPath);
