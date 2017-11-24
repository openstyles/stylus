/* global BG: true, onRuntimeMessage, applyOnMessage, handleUpdate, handleDelete */
/* global FIREFOX: true */
'use strict';

// keep message channel open for sendResponse in chrome.runtime.onMessage listener
const KEEP_CHANNEL_OPEN = true;

const CHROME = Boolean(chrome.app) && parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]);
const OPERA = CHROME && parseFloat(navigator.userAgent.match(/\bOPR\/(\d+\.\d+)|$/)[1]);
const ANDROID = !chrome.windows;
let FIREFOX = !CHROME && parseFloat(navigator.userAgent.match(/\bFirefox\/(\d+\.\d+)|$/)[1]);

if (!CHROME && !chrome.browserAction.openPopup) {
  // in FF pre-57 legacy addons can override useragent so we assume the worst
  // until we know for sure in the async getBrowserInfo()
  // (browserAction.openPopup was added in 57)
  FIREFOX = 50;
  browser.runtime.getBrowserInfo().then(info => {
    FIREFOX = parseFloat(info.version);
  });
}

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
  chromeProtectsNTP: CHROME >= 3161,

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
  if (CHROME && CHROME < 2661) {
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
        msg.tabId = tab.id;
        sendMessage(msg, ignoreChromeError);
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
    msg.tabId = undefined;
    sendMessage(msg, ignoreChromeError);
  }
}


function sendMessage(msg, callback) {
  /*
  Promise mode [default]:
    - rejects on receiving {__ERROR__: message} created by background.js::onRuntimeMessage
    - automatically suppresses chrome.runtime.lastError because it's autogenerated
      by browserAction.setText which lacks a callback param in chrome API
  Standard callback mode:
    - enabled by passing a second param
  */
  const {tabId, frameId} = msg;
  const fn = tabId >= 0 ? chrome.tabs.sendMessage : chrome.runtime.sendMessage;
  const args = tabId >= 0 ? [tabId, msg, {frameId}] : [msg];
  if (callback) {
    fn(...args, callback);
  } else {
    return new Promise((resolve, reject) => {
      fn(...args, r => {
        const err = r && r.__ERROR__;
        (err ? reject : resolve)(err || r);
        chrome.runtime.lastError; // eslint-disable-line no-unused-expressions
      });
    });
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
function openURL({url, index, openerTabId, currentWindow = true}) {
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
          const options = {url, index};
          // FF57+ supports openerTabId, but not in Android (indicated by the absence of chrome.windows)
          if (tab && (!FIREFOX || FIREFOX >= 57 && chrome.windows) && !chromeInIncognito) {
            options.openerTabId = tab.id;
          }
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
    chrome.windows && new Promise(resolve => {
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
    sendMessage({method: 'healthCheck'}, health => {
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


function download(url, {
  method = url.includes('?') ? 'POST' : 'GET',
  headers = {
    'Content-type': 'application/x-www-form-urlencoded',
  },
  body = url.includes('?') ? url.slice(url.indexOf('?')) : null,
  timeout = 10e3,
  requiredStatusCode = 200,
} = {}) {
  return new Promise((resolve, reject) => {
    url = new URL(url);
    if (url.protocol === 'file:' && FIREFOX) {
      // https://stackoverflow.com/questions/42108782/firefox-webextensions-get-local-files-content-by-path
      // FIXME: add FetchController when it is available.
      const timer = setTimeout(() => {
        reject(new Error(`Fetch URL timeout: ${url.href}`));
      }, timeout);
      fetch(url.href, {mode: 'same-origin'})
        .then(r => {
          clearTimeout(timer);
          return r.status === 200 ? r.text() : Promise.reject(r.status);
        })
        .catch(reject)
        .then(resolve);
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeout;
    xhr.onload = () => (
      !requiredStatusCode || xhr.status === requiredStatusCode || url.protocol === 'file:' ?
        resolve(xhr.responseText) :
        reject(xhr.status));
    xhr.onerror = reject;
    xhr.open(method, url.href, true);
    Object.keys(headers || {}).forEach(name => xhr.setRequestHeader(name, headers[name]));
    xhr.send(body);
  });
}


function invokeOrPostpone(isInvoke, fn, ...args) {
  return isInvoke
    ? fn(...args)
    : setTimeout(invokeOrPostpone, 0, true, fn, ...args);
}


function openEditor(id) {
  let url = '/edit.html';
  if (id) {
    url += `?id=${id}`;
  }
  if (chrome.windows && prefs.get('openEditInWindow')) {
    chrome.windows.create(Object.assign({url}, prefs.get('windowPosition')));
  } else {
    openURL({url});
  }
}


function closeCurrentTab() {
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1409375
  getOwnTab().then(tab => {
    if (tab) {
      chrome.tabs.remove(tab.id);
    }
  });
}
