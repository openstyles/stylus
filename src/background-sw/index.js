// WARNING! ../background must be the first to set global.API
import '../background';
import {_execute} from '/js/msg';
import {URLS} from '/js/toolbox';
import './keep-alive';
import './bg-offscreen';
import setClientData from './set-client-data';

/** @param {ExtendableEvent} evt */
self.oninstall = evt => {
  evt.addRoutes({
    condition: {urlPattern: `${URLS.ownOrigin}*.html?clientData`},
    source: 'fetch-event',
  });
  evt.addRoutes({
    condition: {not: {urlPattern: `${URLS.ownOrigin}*.user.css`, requestDestination: 'document'}},
    source: 'network',
  });
};

/** @param {FetchEvent} evt */
self.onfetch = evt => {
  const url = evt.request.url;
  if (!url.startsWith(URLS.ownOrigin)) {
    return; // shouldn't happen but addRoutes may be bugged
  }
  if (url.includes('?clientData')) {
    evt.respondWith(setClientData(url.split(/[/?.]/)[3], evt.clientId || evt.resultingClientId));
  } else if (/\.user.css#\d+$/.test(url)) {
    evt.respondWith(Response.redirect('edit.html'));
  }
};

self.onmessage = evt => {
  if (evt.data[0] === 'port') {
    chrome.runtime.connect({name: evt.data[1]});
    evt.ports[0].onmessage = onClientPortMessage;
    evt.ports[0].postMessage({id: 0});
  }
};

/**
 * @this {MessagePort}
 * @param {MessageEvent} evt
 */
async function onClientPortMessage(evt) {
  const {args, id} = evt.data;
  let res, err;
  try {
    res = _execute('extension', ...args, {});
    if (res instanceof Promise) res = await res;
  } catch (e) {
    err = e;
    res = undefined;
  }
  this.postMessage({id, res, err});
}
