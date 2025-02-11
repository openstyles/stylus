import './intro';
import '@/js/browser';
import {k_msgExec, kInstall, kInvokeAPI, kResolve} from '@/js/consts';
import {DNR, getRuleIds, updateDynamicRules, updateSessionRules} from '@/js/dnr';
import {_execute, onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {chromeSession} from '@/js/storage-util';
import {CHROME, FIREFOX, MOBILE, WINDOWS} from '@/js/ua';
import {sleep} from '@/js/util';
import {broadcast, pingTab} from './broadcast';
import './broadcast-injector-config';
import initBrowserCommandsApi from './browser-cmd-hotkeys';
import {setSystemDark} from './color-scheme';
import {bgBusy, bgInit, bgPreInit, dataHub} from './common';
import reinjectContentScripts from './content-scripts';
import initContextMenus from './context-menus';
import {draftsDB, mirrorStorage, prefsDB, stateDB} from './db';
import download from './download';
import {refreshIconsWhenReady, updateIconBadge} from './icon-manager';
import {setPrefs} from './prefs-api';
import setClientData from './set-client-data';
import * as styleMan from './style-manager';
import * as styleCache from './style-manager/cache';
import {dataMap} from './style-manager/util';
import initStyleViaApi from './style-via-api';
import './style-via-webrequest';
import * as syncMan from './sync-manager';
import {openEditor, openManager, openURL} from './tab-util';
import * as updateMan from './update-manager';
import * as usercssMan from './usercss-manager';
import * as usoApi from './uso-api';
import * as uswApi from './usw-api';

Object.assign(API, /** @namespace API */ {

  //#region API data/db/info

  data: dataHub,

  //#endregion
  //#region API misc actions

  download,
  openEditor,
  openManager,
  openURL,
  pingTab,
  setPrefs,
  setSystemDark,
  updateIconBadge,

  //#endregion
  //#region API namespaced actions

  styles: styleMan,
  sync: syncMan,
  updater: updateMan,
  usercss: usercssMan,
  uso: usoApi,
  usw: uswApi,

  //#endregion

}, !__.MV3 && /** @namespace API */ {

  //#region API for MV2

  setClientData,

  //#endregion

}, __.BUILD !== 'chrome' && FIREFOX && initStyleViaApi());

//#region Events

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (__.BUILD !== 'firefox' && CHROME) {
    reinjectContentScripts();
    initContextMenus();
  }
  if (reason === kInstall) {
    if (MOBILE) prefs.set('manage.newUI', false);
    if (WINDOWS) prefs.set('editor.keyMap', 'sublime');
  }
  if (previousVersion === '1.5.30') {
    prefsDB.delete('badFavs'); // old Stylus marked all icons as bad when network was offline
  }
  (bgPreInit.length ? bgPreInit : bgInit).push(
    styleCache.clear(),
  );
  if (__.MV3) {
    chromeSession.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
    (bgPreInit.length ? bgPreInit : bgInit).push(
      stateDB.clear(),
      DNR.getDynamicRules().then(rules => updateDynamicRules(undefined, getRuleIds(rules))),
      DNR.getSessionRules().then(rules => updateSessionRules(undefined, getRuleIds(rules))),
    );
    refreshIconsWhenReady();
  }
  (async () => {
    if (bgBusy) await bgBusy;
    if (__.MV3 && prefs.__values[usercssMan.kUrlInstaller])
      usercssMan.toggleUrlInstaller(true);
    mirrorStorage(dataMap);
  })();
});

if (__.MV3) {
  chromeSession.get('init', async ({init}) => {
    __.DEBUGLOG('new session:', !init);
    if (init) return;
    chromeSession.set({init: true});
    onStartup();
    await bgBusy;
    reinjectContentScripts();
  });
} else {
  chrome.runtime.onStartup.addListener(onStartup);
}

async function onStartup() {
  await refreshIconsWhenReady();
  await sleep(1000);
  const minDate = Date.now() - 30 * 24 * 60e3;
  for (const id of await draftsDB.getAllKeys()) {
    const {date} = await draftsDB.get(id) || {};
    if (date < minDate) draftsDB.delete(id);
  }
}

onMessage.set((m, sender) => {
  if (m.method === kInvokeAPI) {
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    res = res.apply({msg: m, sender}, m.args);
    return res ?? null;
  }
}, true);

//#endregion

(async () => {
  const numPreInit = bgPreInit.length;
  await Promise.all(bgPreInit);
  await Promise.all(bgPreInit.slice(numPreInit)); // added by an event listener on wake-up
  bgPreInit.length = 0;
  await Promise.all(bgInit.map(v => typeof v === 'function' ? v() : v));
  bgBusy[kResolve]();
  if (__.BUILD !== 'chrome' && FIREFOX) {
    initBrowserCommandsApi();
    initContextMenus();
  }
  if (!__.MV3) {
    global[k_msgExec] = _execute;
    broadcast({method: 'backgroundReady'});
  }
})();
