import {DB, kInjectionOrder, kResolve} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {STORAGE_KEY} from '@/js/prefs';
import {styleJSONseemsValid} from '@/js/sections-util';
import {NOP} from '@/js/util';
import {ignoreChromeError} from '@/js/util-webext';
import * as colorScheme from '../color-scheme';
import {bgBusy, bgInit, onSchemeChange} from '../common';
import {db, draftsDB, execMirror, prefsDB} from '../db';
import './init';
import {fixKnownProblems} from './fixer';
import {broadcastStyleUpdated, setOrderImpl, storeInMap, styleMap, stylePreviewMap} from './util';

bgInit.push(async () => {
  __.DEBUGLOG('styleMan init...');
  let mirrored, validated;
  let [orderFromDb, styles] = await Promise.all([
    prefsDB.get(kInjectionOrder),
    db.getAll(),
  ]);
  if (!orderFromDb)
    orderFromDb = await execMirror(STORAGE_KEY, 'get', kInjectionOrder);
  validated = styles.filter(styleJSONseemsValid);
  if ((!validated.length || validated.length < styles.length)
  && (mirrored = await execMirror(DB, 'getAll'))) {
    styles = validated;
    validated = new Set(validated.map(s => s.id));
    for (const s of mirrored)
      if (s && !validated.has(s.id))
        styles.push(s);
  }
  initStyleMap(styles, mirrored);
  setOrderImpl(orderFromDb, {store: false});
  __.DEBUGLOG('styleMan init done');
});

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

async function initStyleMap(styles, mirrored) {
  let fix, fixed, lost, i, style, len;
  for (i = 0, len = 0, style; i < styles.length; i++) {
    style = styles[i];
    if (+style.id > 0
    && typeof style._id === 'string'
    && styleJSONseemsValid(style)) {
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
    fixed = (await Promise.all([...fixed.values(), bgBusy])).filter(styleJSONseemsValid);
    console[mirrored ? 'log' : 'warn']('Fixed styles:', fixed);
    if (mirrored) {
      styles.push(...fixed);
      fixed.forEach(storeInMap);
    }
  }
  if (styles.length)
    setTimeout(db.putMany, 100, styles);
}
