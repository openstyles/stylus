import {onDisconnect} from '@/js/msg';
import {draftsDb} from '../db';
import {broadcastStyleUpdated, id2data} from './util';

// Using ports to reliably track when the client is closed, however not for messaging,
// because our `API` is much faster due to direct invocation.
onDisconnect.draft = onDraftEnd;
onDisconnect.livePreview = onPreviewEnd;

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
