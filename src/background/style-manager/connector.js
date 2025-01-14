import {kResolve} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {draftsDb} from '../db';
import {broadcastStyleUpdated, dataMap} from './util';

// Using ports to reliably track when the client is closed, however not for messaging,
// because our `API` is much faster due to direct invocation.
onDisconnect.draft = onDraftEnd;
onDisconnect.livePreview = onPreviewEnd;
if (__.MV3) {
  onConnect.draft = onConnect.livePreview = port => {
    __.KEEP_ALIVE(new Promise(resolve => {
      port[kResolve] = resolve;
    }));
  };
}

function onDraftEnd(port) {
  port[kResolve]();
  const id = port.name.split(':')[1];
  draftsDb.delete(+id || id).catch(() => {});
}

function onPreviewEnd(port) {
  port[kResolve]();
  const id = +port.name.split(':')[1];
  const data = dataMap.get(id);
  if (!data) return;
  data.preview = null;
  broadcastStyleUpdated(data.style, 'editPreviewEnd');
}
