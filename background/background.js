/* global
  activateTab
  API
  chromeLocal
  findExistingTab
  FIREFOX
  getActiveTab
  isTabReplaceable
  msg
  openURL
  prefs
  semverCompare
  URLS
  workerUtil
*/
'use strict';

//#region API

Object.assign(API, {

  /** @type {ApiWorker} */
  worker: workerUtil.createWorker({
    url: '/background/background-worker.js',
  }),

  /** @returns {string} */
  getTabUrlPrefix() {
    const {url} = this.sender.tab;
    if (url.startsWith(URLS.ownOrigin)) {
      return 'stylus';
    }
    return url.match(/^([\w-]+:\/+[^/#]+)/)[1];
  },

  /** @returns {Prefs} */
  getPrefs: () => prefs.values,
  setPref(key, value) {
    prefs.set(key, value);
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
    const tab = await openURL({
      url: `${u}`,
      currentWindow: null,
      newWindow: Object.assign(wndBase, !ffBug && wndPos),
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
    let tab = await findExistingTab({
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
    tab = await getActiveTab();
    return isTabReplaceable(tab, url)
      ? activateTab(tab, {url})
      : browser.tabs.create({url}).then(activateTab); // activateTab unminimizes the window
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
});

//#endregion
//#region browserCommands

const browserCommands = {
  openManage: () => API.openManage(),
  openOptions: () => API.openManage({options: true}),
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
  reload: () => chrome.runtime.reload(),
};
if (chrome.commands) {
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}
if (FIREFOX && browser.commands && browser.commands.update) {
  // register hotkeys in FF
  const hotkeyPrefs = Object.keys(prefs.defaults).filter(k => k.startsWith('hotkey.'));
  prefs.subscribe(hotkeyPrefs, (name, value) => {
    try {
      name = name.split('.')[1];
      if (value.trim()) {
        browser.commands.update({name, shortcut: value});
      } else {
        browser.commands.reset(name);
      }
    } catch (e) {}
  });
}

//#endregion
//#region Init

msg.on((msg, sender) => {
  if (msg.method === 'invokeAPI') {
    const fn = msg.path.reduce((res, name) => res && res[name], API);
    if (!fn) throw new Error(`Unknown API.${msg.path.join('.')}`);
    const res = fn.apply({msg, sender}, msg.args);
    return res === undefined ? null : res;
  }
});

chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
  if (reason !== 'update') return;
  if (semverCompare(previousVersion, '1.5.13') <= 0) {
    // Removing unused stuff
    // TODO: delete this entire block by the middle of 2021
    try {
      localStorage.clear();
    } catch (e) {}
    setTimeout(async () => {
      const del = Object.keys(await chromeLocal.get())
        .filter(key => key.startsWith('usoSearchCache'));
      if (del.length) chromeLocal.remove(del);
    }, 15e3);
  }
});

msg.broadcast({method: 'backgroundReady'});

//#endregion
