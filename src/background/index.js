import './intro';
import '/js/browser';
import {kResolve} from '/js/consts';
import {DNR, updateDNR} from '/js/dnr';
import {_execute, API, onMessage} from '/js/msg';
import {createPortProxy} from '/js/port';
import * as prefs from '/js/prefs';
import {CHROME, FIREFOX, MOBILE, WINDOWS} from '/js/ua';
import {workerPath} from '/js/urls';
import {broadcast, pingTab} from './broadcast';
import './broadcast-injector-config';
import initBrowserCommandsApi from './browser-cmd-hotkeys';
import * as colorScheme from './color-scheme';
import {bgReady, isVivaldi} from './common';
import reinjectContentScripts from './content-scripts';
import initContextMenus from './context-menus';
import download from './download';
import {updateIconBadge} from './icon-manager';
import prefsApi from './prefs-api';
import setClientData from './set-client-data';
import * as stateDb from './state-db';
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

  info: {
    get: async () => ({
      dark: colorScheme.isDark,
      favicon: process.env.BUILD !== 'chrome' && FIREFOX
        || (isVivaldi.then ? await isVivaldi : isVivaldi),
    }),
    set(info) {
      let v;
      if ((v = info.preferDark) != null) colorScheme.setSystemDark(v);
    },
  },

  //#endregion
  //#region API misc actions

  download,
  openEditor,
  openManage,
  openURL,
  pingTab,
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

}, !process.env.MV3 && /** @namespace API */ {

  //#region API for MV2

  setClientData,
  /** @type {BackgroundWorker} */
  worker: createPortProxy(workerPath),

  //#endregion

}, process.env.BUILD !== 'chrome' && FIREFOX && initStyleViaApi());

//#region Events

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (process.env.BUILD !== 'firefox' && CHROME) {
    reinjectContentScripts();
    initContextMenus();
  }
  if (reason === 'install') {
    if (MOBILE) prefs.set('manage.newUI', false);
    if (WINDOWS) prefs.set('editor.keyMap', 'sublime');
  }
  if (previousVersion === '1.5.30') {
    API.prefsDb.delete('badFavs'); // old Stylus marked all icons as bad when network was offline
  }
  if (process.env.MV3) {
    stateDb.idb.clear();
    for (const isSession of [false, true]) {
      (isSession ? DNR.getDynamicRules() : DNR.getSessionRules()).then(rules =>
        updateDNR(undefined, rules.map(r => r.id), isSession));
    }
  }
});

onMessage(async (m, sender) => {
  if (m.method === 'invokeAPI') {
    if (bgReady[kResolve]) await bgReady;
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    res = res.apply({msg: m, sender}, m.args);
    return res ?? null;
  }
});

//#endregion

bgReady.styles.then(() => {
  bgReady[kResolve]();
  bgReady[kResolve] = null;
  if (process.env.ENTRY !== 'sw') window._msgExec = _execute;
  if (process.env.BUILD !== 'chrome' && FIREFOX) {
    initBrowserCommandsApi();
    initContextMenus();
  }
  if (!process.env.MV3) broadcast({method: 'backgroundReady'});
});
