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
/* global FIREFOX UA activateTab openURL */ // toolbox.js
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

  /** @returns {string} */
  getTabUrlPrefix() {
    return this.sender.tab.url.match(/^([\w-]+:\/+[^/#]+)/)[1];
  },

  /**
   * Opens the editor or activates an existing tab
   * @param {string|{id?: number, domain?: string, 'url-prefix'?: string}} [params]
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openEditor(params) {
    const u = new URL(chrome.runtime.getURL('edit.html'));
    u.search = new URLSearchParams(params);
    const wnd = chrome.windows && prefs.get('openEditInWindow');
    const wndPos = wnd && prefs.get('windowPosition');
    const wndBase = wnd && prefs.get('openEditInWindow.popup') ? {type: 'popup'} : {};
    const ffBug = wnd && FIREFOX; // https://bugzil.la/1271047
    for (let tab, retry = 0; retry < (wndPos ? 2 : 1); ++retry) {
      try {
        tab = tab || await openURL({
          url: `${u}`,
          currentWindow: null,
          newWindow: wnd && Object.assign({}, wndBase, !ffBug && !retry && wndPos),
        });
        if (ffBug && !retry) await browser.windows.update(tab.windowId, wndPos);
        return tab;
      } catch (e) {}
    }
  },

  /**
   * @param {{}} [opts]
   * @param {boolean} [opts.options]
   * @param {string} [opts.search]
   * @param {string} [opts.searchMode]
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openManage(opts = {}) {
    const setUrlParams = url => {
      const u = new URL(url);
      for (const key of ['search', 'searchMode']) {
        if (key in opts) u.searchParams.set(key, opts[key]);
        else u.searchParams.delete(key);
      }
      u.hash = opts.options ? '#stylus-options' : '';
      return u.href;
    };
    const base = chrome.runtime.getURL('manage.html');
    const url = setUrlParams(base);
    const tabs = await browser.tabs.query({url: base + '*'});
    const same = tabs.find(t => t.url === url);
    let tab = same || tabs[0];
    if (!tab) {
      API.prefsDb.get('badFavs'); // prime the cache to avoid flicker/delay when opening the page
      tab = await openURL({url, newTab: true});
    } else if (!same) {
      await msg.sendTab(tab.id, {method: 'pushState', url: setUrlParams(tab.url)})
        .catch(msg.ignoreError);
    }
    return activateTab(tab); // activateTab unminimizes the window
  },

  openURL,

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
  bgReady._resolveAll();
  msg.ready = true;
  msg.broadcast({method: 'backgroundReady'});
});
