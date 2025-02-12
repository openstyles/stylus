import {DB, kInjectionOrder, kResolve} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {STORAGE_KEY} from '@/js/prefs';
import * as colorScheme from '../color-scheme';
import {bgBusy, bgInit, onSchemeChange} from '../common';
import {db, draftsDB, execMirror, prefsDB} from '../db';
import * as styleCache from './cache';
import './init';
import {fixKnownProblems} from './fixer';
import {broadcastStyleUpdated, dataMap, setOrderImpl, storeInMap} from './util';

bgInit.push(async () => {
  __.DEBUGLOG('styleMan init...');
  let mirrored;
  let [orderFromDb, styles] = await Promise.all([
    prefsDB.get(kInjectionOrder),
    db.getAll(),
  ]);
  if (!orderFromDb)
    orderFromDb = await execMirror(STORAGE_KEY, 'get', kInjectionOrder);
  if (!styles[0])
    styles = mirrored = await execMirror(DB, 'getAll');
  setOrderImpl(orderFromDb, {store: false});
  initStyleMap(styles, mirrored);
  __.DEBUGLOG('styleMan init done');
});

onSchemeChange.add(() => {
  for (const {style} of dataMap.values()) {
    if (colorScheme.SCHEMES.includes(style.preferScheme)) {
      broadcastStyleUpdated(style, 'colorScheme');
    }
  }
});

styleCache.setOnDeleted(val => {
  for (const id in val.sections) {
    dataMap.get(+id)?.appliesTo.delete(val.url);
  }
});

// Using ports to reliably track when the client is closed, however not for messaging,
// because our `API` is much faster due to direct invocation.
onDisconnect.draft = port => {
  if (__.MV3) port[kResolve]();
  const id = port.name.split(':')[1];
  draftsDB.delete(+id || id).catch(() => {
  });
};

onDisconnect.livePreview = port => {
  if (__.MV3) port[kResolve]();
  const id = +port.name.split(':')[1];
  const data = dataMap.get(id);
  if (!data) return;
  data.preview = null;
  broadcastStyleUpdated(data.style, 'editPreviewEnd');
};

if (__.MV3) {
  onConnect.draft = onConnect.livePreview = port => {
    __.KEEP_ALIVE(new Promise(resolve => {
      port[kResolve] = resolve;
    }));
  };
}

async function initStyleMap(styles, mirrored) {
  let fix, fixed, lost, i, style, len;
  for (i = 0, len = 0, style; i < styles.length; i++) {
    style = styles[i];
    if (+style.id > 0
    && typeof style._id === 'string'
    && typeof style.sections?.[0]?.code === 'string') {
      storeInMap(style);
      if (mirrored) {
        if (i > len) styles[len] = style;
        len++;
      }
    } else {
      try { fix = fixKnownProblems(style, true); } catch {}
      if (fix) (fixed ??= new Map()).set(style.id, fix);
      else (lost ??= []).push(style);
    }
  }
  styles.length = len;
  if (lost)
    console.error(`Skipped ${lost.length} unrecoverable styles:`, lost);
  if (fixed) {
    console[mirrored ? 'log' : 'warn'](`Fixed ${fixed.size} styles, ids:`, ...fixed.keys());
    fixed = await Promise.all([...fixed.values(), bgBusy]);
    fixed.pop();
    if (mirrored) {
      styles.push(...fixed);
      fixed.forEach(storeInMap);
    }
  }
  if (styles.length)
    setTimeout(db.putMany, 100, styles);
}
