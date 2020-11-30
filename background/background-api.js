'use strict';

/* Populates API */

define(require => {
  const {
    URLS,
    activateTab,
    findExistingTab,
    getActiveTab,
    isTabReplaceable,
    openURL,
  } = require('/js/toolbox');
  const {API, msg} = require('/js/msg');
  const {createWorker} = require('/js/worker-util');
  const prefs = require('/js/prefs');

  Object.assign(API, ...[
    require('./icon-manager'),
    require('./openusercss-api'),
    require('./search-db'),
  ], /** @namespace API */ {

    browserCommands: {
      openManage: () => API.openManage(),
      openOptions: () => API.openManage({options: true}),
      reload: () => chrome.runtime.reload(),
      styleDisableAll(info) {
        prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
      },
    },

    /** @type {StyleManager} */
    styles: require('./style-manager'),

    /** @type {Sync} */
    sync: require('./sync'),

    /** @type {StyleUpdater} */
    updater: require('./update'),

    /** @type {UsercssHelper} */
    usercss: Object.assign({},
      require('./usercss-api-helper'),
      require('./usercss-install-helper')),

    /** @type {BackgroundWorker} */
    worker: createWorker({
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

    /** @returns {PrefsValues} */
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
    openEditor(params) {
      const u = new URL(chrome.runtime.getURL('edit.html'));
      u.search = new URLSearchParams(params);
      return openURL({
        url: `${u}`,
        currentWindow: null,
        newWindow: prefs.get('openEditInWindow') && Object.assign({},
          prefs.get('openEditInWindow.popup') && {type: 'popup'},
          prefs.get('windowPosition')),
      });
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

  msg.on((msg, sender) => {
    if (msg.method === 'invokeAPI') {
      const fn = msg.path.reduce((res, name) => res && res[name], API);
      if (!fn) throw new Error(`Unknown API.${msg.path.join('.')}`);
      const res = typeof fn === 'function'
        ? fn.apply({msg, sender}, msg.args)
        : fn;
      return res === undefined ? null : res;
    }
  });
});
