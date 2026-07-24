import './intro';
import '@/js/browser';
import {k_msgExec, kBadFavs, kInvokeAPI, kResolve, pKeyMap} from '@/js/consts';
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
import {refreshIconsWhenReady} from './icon-manager';
import setClientData from './set-client-data';
import * as styleMan from './style-manager';
import {inferHomepages} from './style-manager/fixer';
import {styleMap} from './style-manager/util';
import initStyleViaApi from './style-via-api';
import './style-via-webrequest';
import * as syncMan from './sync-manager';
import * as tabMan from './tab-manager';
import {openEditor, openManager, openTab} from './tab-util';
import * as updateMan from './update-manager';
import * as usercssMan from './usercss-manager';
import * as usoApi from './uso-api';
import * as uswApi from './usw-api';
import {worker} from './util';

Object.assign(API, /** @namespace API */ {
  data: {
    get: dataHub.get.bind(dataHub),
    has: dataHub.has.bind(dataHub),
  },
  draftsDB,
  prefs: {
    set(data) {
      for (const k in data) prefs.set(k, data[k]);
    },
  },
  prefsDB,
  state: {
    set: (key, val) => void (__.MV3 ? stateDB.put(val, key) : dataHub.set(key, val)),
  },
  styles: styleMan,
  sync: syncMan,
  tabs: {
    openEditor,
    openManager,
    open: openTab,
    ping: pingTab,
    get: tabMan.get,
    set(tabId, ...args) {
      // `undefined` cannot be sent via JSON-based messaging in Chrome
      // TODO: remove this when minimum_chrome_version >= version that implements structured clone
      if (args[args.length - 1]?.undef === tabId) {
        args[args.length - 1] = undefined;
      }
      tabMan.set(tabId ?? this.sender.tab?.id, ...args);
    },
  },
  updater: updateMan,
  usercss: usercssMan,
  uso: usoApi,
  usw: uswApi,
  util: {
    download,
    setClientData,
    setSystemDark,
  },
}, __.DEV && {worker});
if (__.B_FIREFOX || __.B_ANY && FIREFOX) {
  initStyleViaApi();
}

//#region Events

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (__.B_CHROME || __.B_ANY && CHROME) {
    reinjectContentScripts();
    initContextMenus();
  }
  if (reason === 'install') {
    if (MOBILE) prefs.set('manage.newUI', false);
    if (WINDOWS) prefs.set(pKeyMap, 'sublime');
  }
  if (previousVersion === '1.5.30') {
    prefsDB.delete(kBadFavs); // old Stylus marked all icons as bad when network was offline
  }
  if (/^[23]\.3\.(1[89]|2[0-3])$/.test(previousVersion)) { // .18-.23 didn't set home url
    if (bgInit?.length) bgInit.push(inferHomepages);
    else inferHomepages();
  }
  if (__.MV3) {
    (bgPreInit?.length ? bgPreInit : bgInit || []).push(
      DNR.getDynamicRules().then(rules => updateDynamicRules(undefined, getRuleIds(rules)))
        .then(() => prefs.ready)
        .then(() => usercssMan.toggleUrlInstaller()),
      DNR.getSessionRules().then(rules => updateSessionRules(undefined, getRuleIds(rules))),
    );
  }
  onStartup();
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
  __.DEBUGLOG('onStartup');
  await refreshIconsWhenReady();
  await sleep(1000);
  const minDate = Date.now() - 30 * 24 * 60e3;
  for (const id of await draftsDB.getAllKeys()) {
    const {date} = await draftsDB.get(id) || {};
    if (date < minDate) draftsDB.delete(id);
  }
  if (bgBusy)
    await bgBusy;
  mirrorStorage(styleMap);
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
  await Promise.all(bgInit.splice(0).map(v => typeof v === 'function' ? v() : v));
  bgBusy[kResolve]();
  if (__.B_FIREFOX || __.B_ANY && FIREFOX) {
    initBrowserCommandsApi();
    initContextMenus();
  }
  if (!__.MV3) {
    global[k_msgExec] = _execute;
    broadcast({method: 'backgroundReady'});
  }
})();
