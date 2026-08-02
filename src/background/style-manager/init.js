import {DB, kInjectionOrder, kResolve, STORAGE_KEY, UCD} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {styleJSONseemsValid} from '@/js/style-util';
import {NOP} from '@/js/util';
import {ignoreChromeError} from '@/js/util-webext';
import * as colorScheme from '../color-scheme';
import {bgInit, onSchemeChange} from '../common';
import {db, draftsDB, execMirror, prefsDB} from '../db';
import './init';
import {buildCode} from '../usercss-manager';
import {fixKnownProblems} from './fixer';
import {broadcastStyleUpdated, setOrderImpl, storeInMap, styleMap, stylePreviewMap} from './util';

export const badStyles = [];
const rxVarsAndImport = /^:root\s*{\s+--[\s\S].*?@import\s/i;
const hasVarsAndImport = ({code}) => rxVarsAndImport.test(code);

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
  let mirror;
  if (!orderFromDb)
    orderFromDb = await execMirror(STORAGE_KEY, 'get', kInjectionOrder).catch(console.error);
  if (!styles.length && (mirror = await execMirror(DB, 'getAll').catch(console.error)))
    styles = mirror;
  for (const style of styles) {
    let err;
    try {
      fixKnownProblems(style, true);
      err = (!Array.isArray(style.sections) ||
        /* @import must precede `vars` that we add at beginning */
        style[UCD]?.vars && style.sections.some(hasVarsAndImport)
      ) && (
        !style.sourceCode && 'No sourceCode' ||
        !await buildCode(style) // throws on errors
      ) || !styleJSONseemsValid(style) && 'No name/code';
    } catch (e) {
      err = e;
    }
    if (err) badStyles.push([err, style]);
    else storeInMap(style);
  }
  if (badStyles.length) console.warn(badStyles);
  if (mirror?.length) setTimeout(db.putMany, 100, mirror);
  setOrderImpl(orderFromDb, {store: false});
  __.DEBUGLOG('styleMan init done');
}
