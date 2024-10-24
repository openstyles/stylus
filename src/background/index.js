import './intro';
import browser from '/js/browser';
import * as msg from '/js/msg';
import {API, onMessage} from '/js/msg';
import {createPortProxy} from '/js/port';
import * as prefs from '/js/prefs';
import {FIREFOX, ignoreChromeError, MOBILE, WINDOWS} from '/js/toolbox';
import {workerPath} from '/js/urls';
import {broadcast} from './broadcast';
import './broadcast-injector-config';
import initBrowserCommandsApi from './browser-cmd-hotkeys';
import * as colorScheme from './color-scheme';
import {bgReady, browserCommands, isVivaldi} from './common';
import reinjectContentScripts from './content-scripts';
import initContextMenus from './context-menus';
import download from './download';
import {updateIconBadge} from './icon-manager';
import prefsApi from './prefs-api';
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
      favicon: FIREFOX || (isVivaldi.then ? await isVivaldi : isVivaldi),
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
  /** @type {BackgroundWorker} */
  worker: !process.env.MV3 && createPortProxy(workerPath),

  //#endregion
}, FIREFOX && initStyleViaApi());

if (!process.env.MV3) global.allReady = bgReady.all;

Object.assign(browserCommands, {
  openManage: () => API.openManage(),
  openOptions: () => API.openManage({options: true}),
  reload: () => chrome.runtime.reload(),
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
});

//#region Events

chrome.commands?.onCommand.addListener(id => browserCommands[id]());

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (process.env.BUILD !== 'firefox' && !FIREFOX) {
    reinjectContentScripts();
  }
  if (reason === 'install') {
    if (MOBILE) prefs.set('manage.newUI', false);
    if (WINDOWS) prefs.set('editor.keyMap', 'sublime');
  }
  if (previousVersion === '1.5.30') {
    API.prefsDb.delete('badFavs'); // old Stylus marked all icons as bad when network was offline
  }
});

onMessage((m, sender) => {
  if (m.method === 'invokeAPI') {
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    res = res.apply({msg: m, sender}, m.args);
    return res === undefined ? null : res;
  }
});
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'api') {
    port.onMessage.addListener(apiPortMessage);
    port.onDisconnect.addListener(ignoreChromeError);
  }
});

async function apiPortMessage({id, data, TDM}, port) {
  try {
    if (!self.msg) await bgReady.all;
    port.sender.TDM = TDM;
    data = {data: await msg._execute('extension', data, port.sender)};
  } catch (e) {
    data = msg.wrapError(e);
  }
  data.id = id;
  try { port.postMessage(data); } catch {}
}

//#endregion

Promise.all([
  browser.extension.isAllowedFileSchemeAccess()
    .then(res => API.data.set('hasFileAccess', res)),
  bgReady.styles,
]).then(async () => {
  bgReady._resolveAll(true);
  self.msg = msg;
  if (FIREFOX) initBrowserCommandsApi();
  broadcast({method: 'backgroundReady'});
  initContextMenus();
});
