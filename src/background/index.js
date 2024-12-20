import './intro';
import '@/js/browser';
import {k_msgExec, kInstall, kResolve} from '@/js/consts';
import {DNR, getRuleIds, updateDynamicRules, updateSessionRules} from '@/js/dnr';
import {_execute, API, onMessage} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {CHROME, FIREFOX, MOBILE, WINDOWS} from '@/js/ua';
import {sleep} from '@/js/util';
import {broadcast, pingTab} from './broadcast';
import './broadcast-injector-config';
import initBrowserCommandsApi from './browser-cmd-hotkeys';
import {setSystemDark} from './color-scheme';
import {bgBusy, bgInit, bgPreInit, stateDB} from './common';
import reinjectContentScripts from './content-scripts';
import initContextMenus from './context-menus';
import download from './download';
import {refreshIconsWhenReady, updateIconBadge} from './icon-manager';
import prefsApi from './prefs-api';
import setClientData from './set-client-data';
import * as styleMan from './style-manager';
import initStyleViaApi from './style-via-api';
import './style-via-webrequest';
import * as syncMan from './sync-manager';
import {openEditor, openManage, openURL, waitForTabUrl} from './tab-util';
import * as updateMan from './update-manager';
import * as usercssMan from './usercss-manager';
import * as usoApi from './uso-api';
import * as uswApi from './usw-api';

Object.assign(API, /** @namespace API */ {

  //#region API data/db/info

  /** Temporary storage for data needed elsewhere e.g. in a content script */
  data: ((data = {}) => ({
    del: key => delete data[key],
    get: key => data[key],
    has: key => key in data,
    pop: key => {
      const val = data[key];
      delete data[key];
      return val;
    },
    set: (key, val) => {
      data[key] = val;
    },
  }))(),

  //#endregion
  //#region API misc actions

  download,
  openEditor,
  openManage,
  openURL,
  pingTab,
  setSystemDark,
  updateIconBadge,
  waitForTabUrl,

  //#endregion
  //#region API namespaced actions

  prefs: prefsApi,
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
    API.prefsDb.delete('badFavs'); // old Stylus marked all icons as bad when network was offline
  }
  if (__.MV3) {
    (bgPreInit.length ? bgPreInit : []).push(
      stateDB.clear(),
      DNR.getDynamicRules().then(rules => updateDynamicRules(undefined, getRuleIds(rules))),
      DNR.getSessionRules().then(rules => updateSessionRules(undefined, getRuleIds(rules))),
    );
    refreshIconsWhenReady();
    (async () => {
      if (bgBusy) await bgBusy;
      if (prefs.__values[usercssMan.kUrlInstaller]) usercssMan.toggleUrlInstaller(true);
    })();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshIconsWhenReady();
  await sleep(1000);
  const minDate = Date.now() - 30 * 24 * 60e3;
  for (const id of await API.drafts.getAllKeys()) {
    const {date} = await API.drafts.get(id) || {};
    if (date < minDate) API.drafts.delete(id);
  }
});

onMessage(async (m, sender) => {
  if (m.method === 'invokeAPI') {
    if (bgBusy) await bgBusy;
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    res = res.apply({msg: m, sender}, m.args);
    return res ?? null;
  }
});

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
