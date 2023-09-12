/* global API msg */// msg.js
/* global addAPI bgReady detectVivaldi isVivaldi */// common.js
/* global createWorker */// worker-util.js
/* global prefs */
/* global styleMan */
/* global syncMan */
/* global updateMan */
/* global usercssMan */
/* global usoApi */
/* global uswApi */
/* global FIREFOX UA */ // toolbox.js
/* global colorScheme */ // color-scheme.js
'use strict';

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

  info: {
    async get() {
      let tab;
      return {
        isDark: colorScheme.isDark(),
        isVivaldi: isVivaldi != null ? isVivaldi
          : ((tab = (this.sender || {}).tab))
            ? !!(tab.extData || tab.vivExtData)
            : await detectVivaldi(),
      };
    },
    set(info) {
      let v;
      if ((v = info.preferDark)) colorScheme.setSystem(v);
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
  prefs: {
    getValues: () => prefs.__values, // will be deepCopy'd by apiHandler
    set: prefs.set,
  },
});

//#endregion
//#region Events

const browserCommands = {
  openManage: () => API.openManage(),
  openOptions: () => API.openManage({options: true}),
  reload: () => chrome.runtime.reload(),
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
};

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

msg.on((msg, sender) => {
  if (msg.method === 'invokeAPI') {
    let res = msg.path.reduce((res, name) => res && res[name], API);
    if (!res) throw new Error(`Unknown API.${msg.path.join('.')}`);
    res = res.apply({msg, sender}, msg.args);
    return res === undefined ? null : res;
  }
});

//#endregion

Promise.all([
  browser.extension.isAllowedFileSchemeAccess()
    .then(res => API.data.set('hasFileAccess', res)),
  bgReady.styles,
  /* These are loaded conditionally.
     Each item uses `require` individually so IDE can jump to the source and track usage. */
  FIREFOX &&
    require(['/background/style-via-api']),
  FIREFOX && ((browser.commands || {}).update) &&
    require(['/background/browser-cmd-hotkeys']),
  !FIREFOX &&
    require(['/background/content-scripts']),
  chrome.contextMenus &&
    require(['/background/context-menus']),
]).then(() => {
  bgReady._resolveAll(true);
  msg.ready = true;
  msg.broadcast({method: 'backgroundReady'});
});
