import {draftsDb} from '../db';
import {broadcastStyleUpdated, id2data} from './util';

const ON_DISCONNECT = {
  livePreview: onPreviewEnd,
  draft: onDraftEnd,
};

chrome.runtime.onConnect.addListener(port => {
  // Using ports to reliably track when the client is closed, however not for messaging,
  // because our `API` is much faster due to direct invocation.
  const type = port.name.split(':', 1)[0];
  const fn = ON_DISCONNECT[type];
  if (fn) port.onDisconnect.addListener(fn);
});

function onDraftEnd(port) {
  const id = port.name.split(':')[1];
  draftsDb.delete(+id || id).catch(() => {});
}

function onPreviewEnd({name}) {
  const id = +name.split(':')[1];
  const data = id2data(id);
  if (!data) return;
  data.preview = null;
  broadcastStyleUpdated(data.style, 'editPreviewEnd');
}
