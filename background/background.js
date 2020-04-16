/* global download prefs openURL FIREFOX CHROME
  URLS ignoreChromeError usercssHelper
  styleManager msg navigatorUtil workerUtil contentScripts sync
  findExistingTab createTab activateTab isTabReplaceable getActiveTab
  tabManager */

'use strict';

// eslint-disable-next-line no-var
var backgroundWorker = workerUtil.createWorker({
  url: '/background/background-worker.js'
});

// eslint-disable-next-line no-var
var browserCommands, contextMenus;

// *************************************************************************
// browser commands
browserCommands = {
  openManage,
  openOptions: () => openManage({options: true}),
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
  reload: () => chrome.runtime.reload(),
};

window.API_METHODS = Object.assign(window.API_METHODS || {}, {
  deleteStyle: styleManager.deleteStyle,
  editSave: styleManager.editSave,
  findStyle: styleManager.findStyle,
  getAllStyles: styleManager.getAllStyles, // used by importer
  getSectionsByUrl: styleManager.getSectionsByUrl,
  getStyle: styleManager.get,
  getStylesByUrl: styleManager.getStylesByUrl,
  importStyle: styleManager.importStyle,
  importManyStyles: styleManager.importMany,
  installStyle: styleManager.installStyle,
  styleExists: styleManager.styleExists,
  toggleStyle: styleManager.toggleStyle,

  addInclusion: styleManager.addInclusion,
  removeInclusion: styleManager.removeInclusion,
  addExclusion: styleManager.addExclusion,
  removeExclusion: styleManager.removeExclusion,

  getTabUrlPrefix() {
    const {url} = this.sender.tab;
    if (url.startsWith(URLS.ownOrigin)) {
      return 'stylus';
    }
    return url.match(/^([\w-]+:\/+[^/#]+)/)[1];
  },

  download(msg) {
    delete msg.method;
    return download(msg.url, msg);
  },
  parseCss({code}) {
    return backgroundWorker.parseMozFormat({code});
  },
  getPrefs: prefs.getAll,

  openEditor,

  /* Same as openURL, the only extra prop in `opts` is `message` - it'll be sent when the tab is ready,
  which is needed in the popup, otherwise another extension could force the tab to open in foreground
  thus auto-closing the popup (in Chrome at least) and preventing the sendMessage code from running */
  openURL(opts) {
    const {message} = opts;
    return openURL(opts) // will pass the resolved value untouched when `message` is absent or falsy
      .then(message && (tab => tab.status === 'complete' ? tab : onTabReady(tab)))
      .then(message && (tab => msg.sendTab(tab.id, opts.message)));
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

  optionsCustomizeHotkeys() {
    return browserCommands.openOptions()
      .then(() => new Promise(resolve => setTimeout(resolve, 500)))
      .then(() => msg.broadcastExtension({method: 'optionsCustomizeHotkeys'}));
  },

  syncStart: sync.start,
  syncStop: sync.stop,
  syncNow: sync.syncNow,
  getSyncStatus: sync.getStatus,
  syncLogin: sync.login,

  openManage
});

// *************************************************************************
// register all listeners
msg.on(onRuntimeMessage);

// tell apply.js to refresh styles for non-committed navigation
navigatorUtil.onUrlChange(({tabId, frameId}, type) => {
  if (type !== 'committed') {
    msg.sendTab(tabId, {method: 'urlChanged'}, {frameId})
      .catch(msg.ignoreError);
  }
});

tabManager.onUpdate(({tabId, url, oldUrl = ''}) => {
  if (usercssHelper.testUrl(url) && !oldUrl.startsWith(URLS.installUsercss)) {
    usercssHelper.testContents(tabId, url).then(data => {
      if (data.code) usercssHelper.openInstallerPage(tabId, url, data);
    });
  }
});

if (FIREFOX) {
  // FF misses some about:blank iframes so we inject our content script explicitly
  navigatorUtil.onDOMContentLoaded(webNavIframeHelperFF, {
    url: [
      {urlEquals: 'about:blank'},
    ]
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));
}

if (chrome.commands) {
  // Not available in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1240350
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}

// *************************************************************************
chrome.runtime.onInstalled.addListener(({reason}) => {
  // save install type: "admin", "development", "normal", "sideload" or "other"
  // "normal" = addon installed from webstore
  chrome.management.getSelf(info => {
    localStorage.installType = info.installType;
    if (reason === 'install' && info.installType === 'development' && chrome.contextMenus) {
      createContextMenus(['reload']);
    }
  });

  if (reason !== 'update') return;
  // translations may change
  localStorage.L10N = JSON.stringify({
    browserUIlanguage: chrome.i18n.getUILanguage(),
  });
  // themes may change
  delete localStorage.codeMirrorThemes;
});

// *************************************************************************
// context menus
contextMenus = {
  'show-badge': {
    title: 'menuShowBadge',
    click: info => prefs.set(info.menuItemId, info.checked),
  },
  'disableAll': {
    title: 'disableAllStyles',
    click: browserCommands.styleDisableAll,
  },
  'open-manager': {
    title: 'openStylesManager',
    click: browserCommands.openManage,
  },
  'open-options': {
    title: 'openOptions',
    click: browserCommands.openOptions,
  },
  'reload': {
    presentIf: () => localStorage.installType === 'development',
    title: 'reload',
    click: browserCommands.reload,
  },
  'editor.contextDelete': {
    presentIf: () => !FIREFOX && prefs.get('editor.contextDelete'),
    title: 'editDeleteText',
    type: 'normal',
    contexts: ['editable'],
    documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
    click: (info, tab) => {
      msg.sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension');
    },
  }
};

function createContextMenus(ids) {
  for (const id of ids) {
    let item = contextMenus[id];
    if (item.presentIf && !item.presentIf()) {
      continue;
    }
    item = Object.assign({id}, item);
    delete item.presentIf;
    item.title = chrome.i18n.getMessage(item.title);
    if (!item.type && typeof prefs.defaults[id] === 'boolean') {
      item.type = 'checkbox';
      item.checked = prefs.get(id);
    }
    if (!item.contexts) {
      item.contexts = ['browser_action'];
    }
    delete item.click;
    chrome.contextMenus.create(item, ignoreChromeError);
  }
}

if (chrome.contextMenus) {
  // circumvent the bug with disabling check marks in Chrome 62-64
  const toggleCheckmark = CHROME >= 3172 && CHROME <= 3288 ?
    (id => chrome.contextMenus.remove(id, () => createContextMenus([id]) + ignoreChromeError())) :
    ((id, checked) => chrome.contextMenus.update(id, {checked}, ignoreChromeError));

  const togglePresence = (id, checked) => {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  };

  const keys = Object.keys(contextMenus);
  prefs.subscribe(keys.filter(id => typeof prefs.defaults[id] === 'boolean'), toggleCheckmark);
  prefs.subscribe(keys.filter(id => contextMenus[id].presentIf), togglePresence);
  createContextMenus(keys);
}

// reinject content scripts when the extension is reloaded/updated. Firefox
// would handle this automatically.
if (!FIREFOX) {
  setTimeout(contentScripts.injectToAllTabs, 0);
}

// register hotkeys
if (FIREFOX && browser.commands && browser.commands.update) {
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

msg.broadcastTab({method: 'backgroundReady'});

function webNavIframeHelperFF({tabId, frameId}) {
  if (!frameId) return;
  msg.sendTab(tabId, {method: 'ping'}, {frameId})
    .catch(() => false)
    .then(pong => {
      if (pong) return;
      // insert apply.js to iframe
      const files = chrome.runtime.getManifest().content_scripts[0].js;
      for (const file of files) {
        chrome.tabs.executeScript(tabId, {
          frameId,
          file,
          matchAboutBlank: true,
        }, ignoreChromeError);
      }
    });
}

function onRuntimeMessage(msg, sender) {
  if (msg.method !== 'invokeAPI') {
    return;
  }
  const fn = window.API_METHODS[msg.name];
  if (!fn) {
    throw new Error(`unknown API: ${msg.name}`);
  }
  const context = {msg, sender};
  return fn.apply(context, msg.args);
}

function openEditor(params) {
  /* Open the editor. Activate if it is already opened

  params: {
    id?: Number,
    domain?: String,
    'url-prefix'?: String
  }
  */
  const searchParams = new URLSearchParams();
  for (const key in params) {
    searchParams.set(key, params[key]);
  }
  const search = searchParams.toString();
  return openURL({
    url: 'edit.html' + (search && `?${search}`),
    newWindow: prefs.get('openEditInWindow'),
    windowPosition: prefs.get('windowPosition'),
    currentWindow: null
  });
}

function openManage({options = false, search} = {}) {
  let url = chrome.runtime.getURL('manage.html');
  if (search) {
    url += `?search=${encodeURIComponent(search)}`;
  }
  if (options) {
    url += '#stylus-options';
  }
  return findExistingTab({
    url,
    currentWindow: null,
    ignoreHash: true,
    ignoreSearch: true
  })
    .then(tab => {
      if (tab) {
        return Promise.all([
          activateTab(tab),
          tab.url !== url && msg.sendTab(tab.id, {method: 'pushState', url})
            .catch(console.error)
        ]);
      }
      return getActiveTab().then(tab => {
        if (isTabReplaceable(tab, url)) {
          return activateTab(tab, {url});
        }
        return createTab({url});
      });
    });
}
