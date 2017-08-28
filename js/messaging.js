/* global BG: true, onRuntimeMessage, applyOnMessage, handleUpdate, handleDelete */
'use strict';

// keep message channel open for sendResponse in chrome.runtime.onMessage listener
const KEEP_CHANNEL_OPEN = true;

const FIREFOX = /Firefox/.test(navigator.userAgent);
const OPERA = /OPR/.test(navigator.userAgent);

const URLS = {
  ownOrigin: chrome.runtime.getURL(''),

  optionsUI: [
    chrome.runtime.getURL('options.html'),
    'chrome://extensions/?options=' + chrome.runtime.id,
  ],

  configureCommands:
    OPERA ? 'opera://settings/configureCommands'
          : 'chrome://extensions/configureCommands',

  // CWS cannot be scripted in chromium, see ChromeExtensionsClient::IsScriptableURL
  // https://cs.chromium.org/chromium/src/chrome/common/extensions/chrome_extensions_client.cc
  browserWebStore:
    FIREFOX ? 'https://addons.mozilla.org/' :
    OPERA ? 'https://addons.opera.com/' :
      'https://chrome.google.com/webstore/',

  // Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/
  // TODO: remove when "minimum_chrome_version": "61" or higher
  chromeProtectsNTP:
    parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) >= 3161,

  supported: url => (
    url.startsWith('http') && !url.startsWith(URLS.browserWebStore) ||
    url.startsWith('ftp') ||
    url.startsWith('file') ||
    url.startsWith(URLS.ownOrigin) ||
    !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
  ),
};

let BG = chrome.extension.getBackgroundPage();
if (BG && !BG.getStyles && BG !== window) {
  // own page like editor/manage is being loaded on browser startup
  // before the background page has been fully initialized;
  // it'll be resolved in onBackgroundReady() instead
  BG = null;
}
if (!BG || BG !== window) {
  document.documentElement.classList.toggle('firefox', FIREFOX);
  document.documentElement.classList.toggle('opera', OPERA);
  // TODO: remove once our manifest's minimum_chrome_version is 50+
  // Chrome 49 doesn't report own extension pages in webNavigation apparently
  if (navigator.userAgent.includes('Chrome/49.')) {
    getActiveTab().then(BG.updateIcon);
  }
}

const FIREFOX_NO_DOM_STORAGE = FIREFOX && !tryCatch(() => localStorage);
if (FIREFOX_NO_DOM_STORAGE) {
  // may be disabled via dom.storage.enabled
  Object.defineProperty(window, 'localStorage', {value: {}});
  Object.defineProperty(window, 'sessionStorage', {value: {}});
}


function notifyAllTabs(msg) {
  const originalMessage = msg;
  if (msg.method === 'styleUpdated' || msg.method === 'styleAdded') {
    // apply/popup/manage use only meta for these two methods,
    // editor may need the full code but can fetch it directly,
    // so we send just the meta to avoid spamming lots of tabs with huge styles
    msg = Object.assign({}, msg, {
      style: getStyleWithNoCode(msg.style)
    });
  }
  const maybeIgnoreLastError = FIREFOX ? ignoreChromeError : undefined;
  const affectsAll = !msg.affects || msg.affects.all;
  const affectsOwnOriginOnly = !affectsAll && (msg.affects.editor || msg.affects.manager);
  const affectsTabs = affectsAll || affectsOwnOriginOnly;
  const affectsIcon = affectsAll || msg.affects.icon;
  const affectsPopup = affectsAll || msg.affects.popup;
  const affectsSelf = affectsPopup || msg.prefs;
  if (affectsTabs || affectsIcon) {
    const notifyTab = tab => {
      // own pages will be notified via runtime.sendMessage later
      if ((affectsTabs || URLS.optionsUI.includes(tab.url))
      && !(affectsSelf && tab.url.startsWith(URLS.ownOrigin))
      // skip lazy-loaded aka unloaded tabs that seem to start loading on message in FF
      && (!FIREFOX || tab.width)) {
        chrome.tabs.sendMessage(tab.id, msg, maybeIgnoreLastError);
      }
      if (affectsIcon && BG) {
        BG.updateIcon(tab);
      }
    };
    // list all tabs including chrome-extension:// which can be ours
    Promise.all([
      queryTabs(affectsOwnOriginOnly ? {url: URLS.ownOrigin + '*'} : {}),
      getActiveTab(),
    ]).then(([tabs, activeTab]) => {
      const activeTabId = activeTab && activeTab.id;
      for (const tab of tabs) {
        invokeOrPostpone(tab.id === activeTabId, notifyTab, tab);
      }
    });
  }
  // notify self: the message no longer is sent to the origin in new Chrome
  if (typeof onRuntimeMessage !== 'undefined') {
    onRuntimeMessage(originalMessage);
  }
  // notify apply.js on own pages
  if (typeof applyOnMessage !== 'undefined') {
    applyOnMessage(originalMessage);
  }
  // notify background page and all open popups
  if (affectsSelf) {
    chrome.runtime.sendMessage(msg, maybeIgnoreLastError);
  }
}


function queryTabs(options = {}) {
  return new Promise(resolve =>
    chrome.tabs.query(options, tabs =>
      resolve(tabs)));
}


function getTab(id) {
  return new Promise(resolve =>
    chrome.tabs.get(id, tab =>
      !chrome.runtime.lastError && resolve(tab)));
}


function getOwnTab() {
  return new Promise(resolve =>
    chrome.tabs.getCurrent(tab => resolve(tab)));
}


function getActiveTab() {
  return queryTabs({currentWindow: true, active: true})
    .then(tabs => tabs[0]);
}


function getActiveTabRealURL() {
  return getActiveTab()
    .then(getTabRealURL);
}


function getTabRealURL(tab) {
  return new Promise(resolve => {
    if (tab.url !== 'chrome://newtab/' || URLS.chromeProtectsNTP) {
      resolve(tab.url);
    } else {
      chrome.webNavigation.getFrame({tabId: tab.id, frameId: 0, processId: -1}, frame => {
        resolve(frame && frame.url || '');
      });
    }
  });
}


// opens a tab or activates the already opened one,
// reuses the New Tab page if it's focused now
function openURL({url, currentWindow = true}) {
  if (!url.includes('://')) {
    url = chrome.runtime.getURL(url);
  }
  return new Promise(resolve => {
    // [some] chromium forks don't handle their fake branded protocols
    url = url.replace(/^(opera|vivaldi)/, 'chrome');
    // FF doesn't handle moz-extension:// URLs (bug)
    // API doesn't handle the hash-fragment part
    const urlQuery = url.startsWith('moz-extension') ? undefined : url.replace(/#.*/, '');
    queryTabs({url: urlQuery, currentWindow}).then(tabs => {
      for (const tab of tabs) {
        if (tab.url === url) {
          activateTab(tab).then(resolve);
          return;
        }
      }
      getActiveTab().then(tab => {
        const chromeInIncognito = tab && tab.incognito && url.startsWith('chrome');
        if (tab && tab.url === 'chrome://newtab/' && !chromeInIncognito) {
          // update current NTP, except for chrome:// or chrome-extension:// in incognito
          chrome.tabs.update({url}, resolve);
        } else {
          // create a new tab
          const openerSupported = !FIREFOX && tab && !chromeInIncognito;
          const options = openerSupported ? {url, openerTabId: tab.id} : {url};
          chrome.tabs.create(options, resolve);
        }
      });
    });
  });
}


function activateTab(tab) {
  return Promise.all([
    new Promise(resolve => {
      chrome.tabs.update(tab.id, {active: true}, resolve);
    }),
    new Promise(resolve => {
      chrome.windows.update(tab.windowId, {focused: true}, resolve);
    }),
  ]);
}


function stringAsRegExp(s, flags) {
  return new RegExp(s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&'), flags);
}


function ignoreChromeError() {
  chrome.runtime.lastError; // eslint-disable-line no-unused-expressions
}


function getStyleWithNoCode(style) {
  const stripped = Object.assign({}, style, {sections: []});
  for (const section of style.sections) {
    stripped.sections.push(Object.assign({}, section, {code: null}));
  }
  return stripped;
}


// js engine can't optimize the entire function if it contains try-catch
// so we should keep it isolated from normal code in a minimal wrapper
// Update: might get fixed in V8 TurboFan in the future
function tryCatch(func, ...args) {
  try {
    return func(...args);
  } catch (e) {}
}


function tryRegExp(regexp) {
  try {
    return new RegExp(regexp);
  } catch (e) {}
}


function tryJSONparse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {}
}


const debounce = Object.assign((fn, delay, ...args) => {
  clearTimeout(debounce.timers.get(fn));
  debounce.timers.set(fn, setTimeout(debounce.run, delay, fn, ...args));
}, {
  timers: new Map(),
  run(fn, ...args) {
    debounce.timers.delete(fn);
    fn(...args);
  },
  unregister(fn) {
    clearTimeout(debounce.timers.get(fn));
    debounce.timers.delete(fn);
  },
});


function deepCopy(obj) {
  return obj !== null && obj !== undefined && typeof obj === 'object'
    ? deepMerge(typeof obj.slice === 'function' ? [] : {}, obj)
    : obj;
}


function deepMerge(target, ...args) {
  const isArray = typeof target.slice === 'function';
  for (const obj of args) {
    if (isArray && obj !== null && obj !== undefined) {
      for (const element of obj) {
        target.push(deepCopy(element));
      }
      continue;
    }
    for (const k in obj) {
      const value = obj[k];
      if (k in target && typeof value === 'object' && value !== null) {
        deepMerge(target[k], value);
      } else {
        target[k] = deepCopy(value);
      }
    }
  }
  return target;
}


function sessionStorageHash(name) {
  return {
    name,
    value: tryCatch(JSON.parse, sessionStorage[name]) || {},
    set(k, v) {
      this.value[k] = v;
      this.updateStorage();
    },
    unset(k) {
      delete this.value[k];
      this.updateStorage();
    },
    updateStorage() {
      sessionStorage[this.name] = JSON.stringify(this.value);
    }
  };
}


function onBackgroundReady() {
  return BG && BG.getStyles ? Promise.resolve() : new Promise(function ping(resolve) {
    chrome.runtime.sendMessage({method: 'healthCheck'}, health => {
      if (health !== undefined) {
        BG = chrome.extension.getBackgroundPage();
        resolve();
      } else {
        setTimeout(ping, 0, resolve);
      }
    });
  });
}


// in case Chrome haven't yet loaded the bg page and displays our page like edit/manage
function getStylesSafe(options) {
  return onBackgroundReady()
    .then(() => BG.getStyles(options));
}


function saveStyleSafe(style) {
  return onBackgroundReady()
    .then(() => BG.saveStyle(BG.deepCopy(style)))
    .then(savedStyle => {
      if (style.notify === false) {
        handleUpdate(savedStyle, style);
      }
      return savedStyle;
    });
}


function deleteStyleSafe({id, notify = true} = {}) {
  return onBackgroundReady()
    .then(() => BG.deleteStyle({id, notify}))
    .then(() => {
      if (!notify) {
        handleDelete(id);
      }
      return id;
    });
}


function download(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 10e3;
    xhr.onloadend = () => (xhr.status === 200
      ? resolve(xhr.responseText)
      : reject(xhr.status));
    const [mainUrl, query] = url.split('?');
    xhr.open(query ? 'POST' : 'GET', mainUrl, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.send(query);
  });
}


function doTimeout(ms = 0, ...args) {
  return ms > 0
    ? () => new Promise(resolve => setTimeout(resolve, ms, ...args))
    : new Promise(resolve => setTimeout(resolve, 0, ...args));
}


function invokeOrPostpone(isInvoke, fn, ...args) {
  return isInvoke
    ? fn(...args)
    : setTimeout(invokeOrPostpone, 0, true, fn, ...args);
}
