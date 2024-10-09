import browser from '/js/browser';
import {onMessage} from '/js/msg';
import * as msg from '/js/msg';
import * as prefs from '/js/prefs';
import {ignoreChromeError, UA} from '/js/toolbox';
import createWorker from '/js/worker-host';
import {broadcast} from './broadcast';
import './broadcast-injector-config';
import * as colorScheme from './color-scheme';
import {addAPI, API, bgReady, browserCommands, isVivaldi} from './common';
import download from './download';
import './bg-prefs';
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
        isVivaldi: isVivaldi.then ? await isVivaldi : isVivaldi,
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
  worker: createWorker('background-worker'),
});

//#endregion
//#region Events

Object.assign(browserCommands, {
  openManage: () => API.openManage(),
  openOptions: () => API.openManage({options: true}),
  reload: () => chrome.runtime.reload(),
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
});

if (chrome.commands) {
  chrome.commands.onCommand.addListener(id => browserCommands[id]());
}

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (reason === 'install') {
    if (UA.mobile) prefs.set('manage.newUI', false);
    if (UA.windows) prefs.set('editor.keyMap', 'sublime');
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
});
