/* global API msg */// msg.js
/* global addAPI bgReady */// common.js
/* global createWorker */// worker-util.js
/* global prefs */
/* global styleMan */
/* global syncMan */
/* global updateMan */
/* global usercssMan */
/* global uswApi */
/* global
  FIREFOX
  UA
  URLS
  activateTab
  download
  findExistingTab
  openURL
*/ // toolbox.js
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

  styles: styleMan,
  sync: syncMan,
  updater: updateMan,
  usercss: usercssMan,
  usw: uswApi,
  colorScheme,
  /** @type {BackgroundWorker} */
  worker: createWorker({url: '/background/background-worker'}),

  download(url, opts) {
    return typeof url === 'string' && url.startsWith(URLS.uso) &&
      this.sender.url.startsWith(URLS.uso) &&
      download(url, opts || {});
  },

  /** @returns {string} */
  getTabUrlPrefix() {
    return this.sender.tab.url.match(/^([\w-]+:\/+[^/#]+)/)[1];
  },

  /**
   * Opens the editor or activates an existing tab
   * @param {{
       id?: number
       domain?: string
       'url-prefix'?: string
     }} params
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openEditor(params) {
    const u = new URL(chrome.runtime.getURL('edit.html'));
    u.search = new URLSearchParams(params);
    const wnd = prefs.get('openEditInWindow');
    const wndPos = wnd && prefs.get('windowPosition');
    const wndBase = wnd && prefs.get('openEditInWindow.popup') ? {type: 'popup'} : {};
    const ffBug = wnd && FIREFOX; // https://bugzil.la/1271047
    if (wndPos) {
      const {left, top, width, height} = wndPos;
      const r = left + width;
      const b = top + height;
      const peek = 32;
      if (isNaN(r) || r < peek || left > screen.availWidth - peek || width < 100) {
        delete wndPos.left;
        delete wndPos.width;
      }
      if (isNaN(b) || b < peek || top > screen.availHeight - peek || height < 100) {
        delete wndPos.top;
        delete wndPos.height;
      }
    }
    const tab = await openURL({
      url: `${u}`,
      currentWindow: null,
      newWindow: wnd && Object.assign(wndBase, !ffBug && wndPos),
    });
    if (ffBug) await browser.windows.update(tab.windowId, wndPos);
    return tab;
  },

  /** @returns {Promise<chrome.tabs.Tab>} */
  async openManage({options = false, search, searchMode} = {}) {
    let url = chrome.runtime.getURL('manage.html');
    if (search) {
      url += `?search=${encodeURIComponent(search)}&searchMode=${searchMode}`;
    }
    if (options) {
      url += '#stylus-options';
    }
    const tab = await findExistingTab({
      url,
      currentWindow: null,
      ignoreHash: true,
      ignoreSearch: true,
    });
    if (tab) {
      await activateTab(tab);
      if (url !== (tab.pendingUrl || tab.url)) {
        await msg.sendTab(tab.id, {method: 'pushState', url}).catch(console.error);
      }
      return tab;
    }
    API.prefsDb.get('badFavs'); // prime the cache to avoid flicker/delay when opening the page
    return openURL({url, ignoreExisting: true}).then(activateTab); // activateTab unminimizes the window
  },

  /**
   * Same as openURL, the only extra prop in `opts` is `message` - it'll be sent
   * when the tab is ready, which is needed in the popup, otherwise another
   * extension could force the tab to open in foreground thus auto-closing the
   * popup (in Chrome at least) and preventing the sendMessage code from running
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openURL(opts) {
    const tab = await openURL(opts);
    if (opts.message) {
      await onTabReady(tab);
      await msg.sendTab(tab.id, opts.message);
    }
    return tab;
    function onTabReady(tab) {
      return new Promise((resolve, reject) =>
        setTimeout(function ping(numTries = 10, delay = 100) {
          msg.sendTab(tab.id, {method: 'ping'})
            .catch(() => false)
            .then(pong => pong
              ? resolve(tab)
              : numTries && setTimeout(ping, delay, numTries - 1, delay * 1.5) ||
                reject('timeout'));
        }));
    }
  },

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
  // TODO: remove this before 1.5.23 as it's only for a few users who installed git 26b75e77
  if (reason === 'update' && previousVersion === '1.5.22') {
    for (const dbName of ['drafts', prefs.STORAGE_KEY]) {
      try {
        indexedDB.open(dbName).onsuccess = async e => {
          const idb = /** @type IDBDatabase */ e.target.result;
          const ta = idb.objectStoreNames[0] === 'data' && idb.transaction(['data']);
          if (ta && ta.objectStore('data').autoIncrement) {
            ta.abort();
            idb.close();
            await new Promise(setTimeout);
            indexedDB.deleteDatabase(dbName);
          }
        };
      } catch (e) {}
    }
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
