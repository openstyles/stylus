import './intro';
import * as msg from '/js/msg';
import './keep-alive';
import './bg-offscreen';
import '../background';
import {URLS} from '/js/toolbox';

/** @param {ExtendableEvent} evt */
self.oninstall = evt => {
  evt.addRoutes({
    condition: {not: {urlPattern: `${URLS.ownOrigin}*.user.css`}},
    source: 'network',
  });
};

/** @param {FetchEvent} evt */
self.onfetch = evt => {
  let url = evt.request.url;
  if (url.startsWith(URLS.ownOrigin)
  && +(url = url.split('#'))[1]
  && url[0].endsWith('.user.css')
  && !url[0].includes('?') /* skipping installer */) {
    evt.respondWith(Response.redirect('edit.html?id=' + url[1]));
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
    res = msg._execute('extension', ...args, {});
    if (res instanceof Promise) res = await res;
  } catch (e) {
    err = e;
    res = undefined;
  }
  this.postMessage({id, res, err});
}
