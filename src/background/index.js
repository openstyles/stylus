import browser from '/js/browser';
import * as msg from '/js/msg';
import * as prefs from '/js/prefs';
import {ignoreChromeError, UA} from '/js/toolbox';
import createWorker from '/js/worker-host';
import {bgPrefsSet} from './bg-prefs';
import {broadcast} from './broadcast';
import broadcastInjectorConfig, {INJECTOR_CONFIG_MAP} from './broadcast-injector-config';
import * as colorScheme from './color-scheme';
import {addAPI, API, bgReady, browserCommands, detectVivaldi, isVivaldi} from './common';
import download from './download';
import './browser-cmd-hotkeys';
import './content-scripts';
import './context-menus';
import * as styleMan from './style-manager';
import * as syncMan from './sync-manager';
import * as updateMan from './update-manager';
import * as usercssMan from './usercss-manager';
import * as usoApi from './uso-api';
import * as uswApi from './usw-api';
import './style-via-api';

//#region API

addAPI(/** @namespace API */ {

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

  download,

  info: {
    async get() {
      return {
        isDark: colorScheme.isDark(),
        isVivaldi: isVivaldi != null ? isVivaldi : await detectVivaldi(),
      };
    },
    set(info) {
      let v;
      if ((v = info.preferDark) != null) colorScheme.setSystem(v);
    },
  },

  styles: styleMan,
  sync: syncMan,
  updater: updateMan,
  usercss: usercssMan,
  uso: usoApi,
  usw: uswApi,
  /** @type {BackgroundWorker} */
  worker: createWorker({url: '/background/background-worker'}),
});

//#endregion
//#region Events

Object.assign(browserCommands, {
  openManage: () => API.openManage(),
  openOptions: () => API.openManage({options: true}),
  reload: () => chrome.runtime.reload(),
  styleDisableAll(info) {
    bgPrefsSet('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
});

if (chrome.commands) {
  chrome.commands.onCommand.addListener(id => browserCommands[id]());
}

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (reason === 'install') {
    if (UA.mobile) bgPrefsSet('manage.newUI', false);
    if (UA.windows) bgPrefsSet('editor.keyMap', 'sublime');
  }
  if (previousVersion === '1.5.30') {
    API.prefsDb.delete('badFavs'); // old Stylus marked all icons as bad when network was offline
  }
});

msg.on((msg, sender) => {
  if (msg.method === 'invokeAPI') {
    let res = API;
    for (const p of msg.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${msg.path}`);
    res = res.apply({msg, sender}, msg.args);
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
  try { port.postMessage(data); } catch (e) {}
}

//#endregion

Promise.all([
  browser.extension.isAllowedFileSchemeAccess()
    .then(res => API.data.set('hasFileAccess', res)),
  bgReady.styles,
]).then(() => {
  bgReady._resolveAll(true);
  self.msg = msg;
  broadcast({method: 'backgroundReady'});
  prefs.subscribe(Object.keys(INJECTOR_CONFIG_MAP), broadcastInjectorConfig);
  colorScheme.onChange(broadcastInjectorConfig.bind(null, 'dark'));
});
