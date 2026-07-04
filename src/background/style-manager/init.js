import {DB, kInjectionOrder, kResolve, STORAGE_KEY} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {styleJSONseemsValid} from '@/js/style-util';
import {NOP} from '@/js/util';
import {ignoreChromeError} from '@/js/util-webext';
import * as colorScheme from '../color-scheme';
import {bgInit, onSchemeChange} from '../common';
import {db, draftsDB, execMirror, prefsDB} from '../db';
import './init';
import {fixKnownProblems} from './fixer';
import {broadcastStyleUpdated, setOrderImpl, storeInMap, styleMap, stylePreviewMap} from './util';

bgInit.push(initStyleMap);

onSchemeChange.add(() => {
  for (const style of styleMap.values()) {
    if (colorScheme.SCHEMES.includes(style.preferScheme)) {
      broadcastStyleUpdated(style, 'colorScheme');
    }
  }
});

// Using ports to reliably track when the client is closed, however not for messaging,
// because our `API` is much faster due to direct invocation.
onDisconnect.draft = port => {
  ignoreChromeError();
  if (__.MV3) port[kResolve]();
  const id = port.name.split(':')[1];
  draftsDB.delete(+id || id).catch(NOP);
};

onDisconnect.livePreview = port => {
  ignoreChromeError();
  if (__.MV3) port[kResolve]();
  const id = +port.name.split(':')[1];
  const style = styleMap.get(id);
  if (!style) return;
  stylePreviewMap.delete(id);
  broadcastStyleUpdated(style, 'editPreviewEnd');
};

if (__.MV3) {
  onConnect.draft = onConnect.livePreview = port => {
    __.KEEP_ALIVE(new Promise(resolve => {
      port[kResolve] = resolve;
    }));
  };
}

async function initStyleMap() {
  __.DEBUGLOG('styleMan init...');
  let [orderFromDb, styles] = await Promise.all([
    prefsDB.get(kInjectionOrder),
    db.getAll(),
  ]);
  if (!orderFromDb)
    orderFromDb = await execMirror(STORAGE_KEY, 'get', kInjectionOrder).catch(console.error);
  if (!styles.length)
    styles = await execMirror(DB, 'getAll').catch(console.error) || styles;
  for (let style of styles) {
    const fix = fixKnownProblems(style, true);
    if (fix instanceof Promise) try {
      style = await fix;
    } catch (err) {
      console.warn(err, style); // TODO: expose in UI
      continue;
    }
    if (styleJSONseemsValid(style)) {
      storeInMap(style);
    } else {
      console.warn('Ignoring damaged style in DB', style); // TODO: expose in UI
    }
  }
  setOrderImpl(orderFromDb, {store: false});
  __.DEBUGLOG('styleMan init done');
}
