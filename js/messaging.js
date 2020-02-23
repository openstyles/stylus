/* exported getTab getActiveTab onTabReady stringAsRegExp openURL ignoreChromeError
  getStyleWithNoCode tryRegExp sessionStorageHash download deepEqual
  closeCurrentTab capitalize CHROME_HAS_BORDER_BUG */
/* global promisify */
'use strict';

const CHROME = Boolean(chrome.app) && parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]);
const OPERA = Boolean(chrome.app) && parseFloat(navigator.userAgent.match(/\bOPR\/(\d+\.\d+)|$/)[1]);
const VIVALDI = Boolean(chrome.app) && navigator.userAgent.includes('Vivaldi');
// FIXME: who use this?
// const ANDROID = !chrome.windows;
let FIREFOX = !chrome.app && parseFloat(navigator.userAgent.match(/\bFirefox\/(\d+\.\d+)|$/)[1]);

// see PR #781
const CHROME_HAS_BORDER_BUG = CHROME >= 3167 && CHROME <= 3704;

if (!CHROME && !chrome.browserAction.openPopup) {
  // in FF pre-57 legacy addons can override useragent so we assume the worst
  // until we know for sure in the async getBrowserInfo()
  // (browserAction.openPopup was added in 57)
  FIREFOX = browser.runtime.getBrowserInfo ? 51 : 50;
  // getBrowserInfo was added in FF 51
  Promise.resolve(FIREFOX >= 51 ? browser.runtime.getBrowserInfo() : {version: 50}).then(info => {
    FIREFOX = parseFloat(info.version);
    document.documentElement.classList.add('moz-appearance-bug', FIREFOX && FIREFOX < 54);
  });
}

const URLS = {
  ownOrigin: chrome.runtime.getURL(''),

  // FIXME delete?
  optionsUI: [
    chrome.runtime.getURL('options.html'),
    'chrome://extensions/?options=' + chrome.runtime.id,
  ],

  configureCommands:
    OPERA ? 'opera://settings/configureCommands'
          : 'chrome://extensions/configureCommands',

  installUsercss: chrome.runtime.getURL('install-usercss.html'),

  // CWS cannot be scripted in chromium, see ChromeExtensionsClient::IsScriptableURL
  // https://cs.chromium.org/chromium/src/chrome/common/extensions/chrome_extensions_client.cc
  browserWebStore:
    FIREFOX ? 'https://addons.mozilla.org/' :
    OPERA ? 'https://addons.opera.com/' :
      'https://chrome.google.com/webstore/',

  emptyTab: [
    // Chrome and simple forks
    'chrome://newtab/',
    // Opera
    'chrome://startpage/',
    // Vivaldi
    'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/startpage/startpage.html',
    // Firefox
    'about:home',
    'about:newtab',
  ],

  // Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/
  // TODO: remove when "minimum_chrome_version": "61" or higher
  chromeProtectsNTP: CHROME >= 3161,

  userstylesOrgJson: 'https://userstyles.org/styles/chrome/',

  supported: url => (
    url.startsWith('http') && (FIREFOX || !url.startsWith(URLS.browserWebStore)) ||
    url.startsWith('ftp') ||
    url.startsWith('file') ||
    url.startsWith(URLS.ownOrigin) ||
    !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
  ),
};

const IS_BG = chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage() === window;

if (!IS_BG) {
  if (FIREFOX) {
    document.documentElement.classList.add('firefox');
  } else if (OPERA) {
    document.documentElement.classList.add('opera');
  } else {
    if (VIVALDI) document.documentElement.classList.add('vivaldi');
  }
}

if (IS_BG) {
  window.API_METHODS = {};
}

// FIXME: `localStorage` and `sessionStorage` may be disabled via dom.storage.enabled
// Object.defineProperty(window, 'localStorage', {value: {}});
// Object.defineProperty(window, 'sessionStorage', {value: {}});

const createTab = promisify(chrome.tabs.create.bind(chrome.tabs));
const queryTabs = promisify(chrome.tabs.query.bind(chrome.tabs));
const updateTab = promisify(chrome.tabs.update.bind(chrome.tabs));
const moveTabs = promisify(chrome.tabs.move.bind(chrome.tabs));

// Android doesn't have chrome.windows
const updateWindow = chrome.windows && promisify(chrome.windows.update.bind(chrome.windows));
const createWindow = chrome.windows && promisify(chrome.windows.create.bind(chrome.windows));
// FF57+ supports openerTabId, but not in Android
// (detecting FF57 by the feature it added, not navigator.ua which may be spoofed in about:config)
const openerTabIdSupported = (!FIREFOX || window.AbortController) && chrome.windows != null;

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

function urlToMatchPattern(url, ignoreSearch) {
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
  if (!/^(http|https|ws|wss|ftp|data|file)$/.test(url.protocol)) {
    return undefined;
  }
  if (ignoreSearch) {
    return [
      `${url.protocol}//${url.hostname}/${url.pathname}`,
      `${url.protocol}//${url.hostname}/${url.pathname}?*`
    ];
  }
  // FIXME: is %2f allowed in pathname and search?
  return `${url.protocol}//${url.hostname}/${url.pathname}${url.search}`;
}

function findExistingTab({url, currentWindow, ignoreHash = true, ignoreSearch = false}) {
  url = new URL(url);
  return queryTabs({url: urlToMatchPattern(url, ignoreSearch), currentWindow})
    // FIXME: is tab.url always normalized?
    .then(tabs => tabs.find(matchTab));

  function matchTab(tab) {
    const tabUrl = new URL(tab.url);
    return tabUrl.protocol === url.protocol &&
      tabUrl.username === url.username &&
      tabUrl.password === url.password &&
      tabUrl.hostname === url.hostname &&
      tabUrl.port === url.port &&
      tabUrl.pathname === url.pathname &&
      (ignoreSearch || tabUrl.search === url.search) &&
      (ignoreHash || tabUrl.hash === url.hash);
  }
}

/**
 * Opens a tab or activates an existing one,
 * reuses the New Tab page or about:blank if it's focused now
 * @param {Object} _
 * @param {string} _.url - if relative, it's auto-expanded to the full extension URL
 * @param {number} [_.index] move the tab to this index in the tab strip, -1 = last
 * @param {number} [_.openerTabId] defaults to the active tab
 * @param {Boolean} [_.active=true] `true` to activate the tab
 * @param {Boolean|null} [_.currentWindow=true] `null` to check all windows
 * @param {Boolean} [_.newWindow=false] `true` to open a new window
 * @param {chrome.windows.CreateData} [_.windowPosition] options for chrome.windows.create
 * @returns {Promise<chrome.tabs.Tab>} Promise -> opened/activated tab
 */
function openURL({
  url,
  index,
  openerTabId,
  active = true,
  currentWindow = true,
  newWindow = false,
  windowPosition,
}) {
  if (!url.includes('://')) {
    url = chrome.runtime.getURL(url);
  }
  return findExistingTab({url, currentWindow}).then(tab => {
    if (tab) {
      return activateTab(tab, {
        index,
        openerTabId,
        // when hash is different we can only set `url` if it has # otherwise the tab would reload
        url: url !== tab.url && url.includes('#') ? url : undefined,
      });
    }
    if (newWindow && createWindow) {
      return createWindow(Object.assign({url}, windowPosition))
        .then(wnd => wnd.tabs[0]);
    }
    return getActiveTab().then((activeTab = {url: ''}) =>
      isTabReplaceable(activeTab, url) ?
        activateTab(activeTab, {url, openerTabId}) : // not moving the tab
        createTabWithOpener(activeTab, {url, index, active}));
  });
  function createTabWithOpener(openerTab, options) {
    const id = openerTabId == null ? openerTab.id : openerTabId;
    if (id != null && !openerTab.incognito && openerTabIdSupported) {
      options.openerTabId = id;
    }
    return createTab(options);
  }
}

// replace empty tab (NTP or about:blank)
// except when new URL is chrome:// or chrome-extension:// and the empty tab is
// in incognito
function isTabReplaceable(tab, newUrl) {
  if (!tab || !URLS.emptyTab.includes(tab.url)) {
    return false;
  }
  // FIXME: but why?
  if (tab.incognito && newUrl.startsWith('chrome')) {
    return false;
  }
  return true;
}

function activateTab(tab, {url, index, openerTabId} = {}) {
  const options = {active: true};
  if (url) {
    options.url = url;
  }
  if (openerTabId != null && openerTabIdSupported) {
    options.openerTabId = openerTabId;
  }
  return Promise.all([
    updateTab(tab.id, options),
    updateWindow && updateWindow(tab.windowId, {focused: true}),
    index != null && moveTabs(tab.id, {index})
  ])
    .then(() => tab);
}


function stringAsRegExp(s, flags) {
  return new RegExp(s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&'), flags);
}


function ignoreChromeError() {
  // eslint-disable-next-line no-unused-expressions
  chrome.runtime.lastError;
}


function getStyleWithNoCode(style) {
  const stripped = deepCopy(style);
  for (const section of stripped.sections) section.code = null;
  stripped.sourceCode = null;
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


function tryRegExp(regexp, flags) {
  try {
    return new RegExp(regexp, flags);
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
  if (!obj || typeof obj !== 'object') return obj;
  // N.B. the copy should be an explicit literal
  if (Array.isArray(obj)) {
    const copy = [];
    for (const v of obj) {
      copy.push(!v || typeof v !== 'object' ? v : deepCopy(v));
    }
    return copy;
  }
  const copy = {};
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  for (const k in obj) {
    if (!hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    copy[k] = !v || typeof v !== 'object' ? v : deepCopy(v);
  }
  return copy;
}


function deepEqual(a, b, ignoredKeys) {
  if (!a || !b) return a === b;
  const type = typeof a;
  if (type !== typeof b) return false;
  if (type !== 'object') return a === b;
  if (Array.isArray(a)) {
    return Array.isArray(b) &&
           a.length === b.length &&
           a.every((v, i) => deepEqual(v, b[i], ignoredKeys));
  }
  for (const key in a) {
    if (!Object.hasOwnProperty.call(a, key) ||
        ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!Object.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], ignoredKeys)) return false;
  }
  for (const key in b) {
    if (!Object.hasOwnProperty.call(b, key) ||
        ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!Object.hasOwnProperty.call(a, key)) return false;
  }
  return true;
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

/**
 * @param {String} url
 * @param {Object} params
 * @param {String} [params.method]
 * @param {String|Object} [params.body]
 * @param {String} [params.responseType] arraybuffer, blob, document, json, text
 * @param {Number} [params.requiredStatusCode] resolved when matches, otherwise rejected
 * @param {Number} [params.timeout] ms
 * @param {Object} [params.headers] {name: value}
 * @returns {Promise}
 */
function download(url, {
  method = 'GET',
  body,
  responseType = 'text',
  requiredStatusCode = 200,
  timeout = 10e3,
  headers = {
    'Content-type': 'application/x-www-form-urlencoded',
  },
} = {}) {
  const queryPos = url.indexOf('?');
  if (queryPos > 0 && body === undefined) {
    method = 'POST';
    body = url.slice(queryPos);
    url = url.slice(0, queryPos);
  }
  // * USO can't handle POST requests for style json
  // * XHR/fetch can't handle long URL
  // So we need to collapse all long variables and expand them in the response
  const usoVars = [];

  return new Promise((resolve, reject) => {
    const u = new URL(collapseUsoVars(url));
    if (u.protocol === 'file:' && FIREFOX) {
      // https://stackoverflow.com/questions/42108782/firefox-webextensions-get-local-files-content-by-path
      // FIXME: add FetchController when it is available.
      const timer = setTimeout(reject, timeout, new Error('Timeout fetching ' + u.href));
      fetch(u.href, {mode: 'same-origin'})
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
    xhr.onloadend = event => {
      if (event.type !== 'error' && (
          xhr.status === requiredStatusCode || !requiredStatusCode ||
          u.protocol === 'file:')) {
        resolve(expandUsoVars(xhr.response));
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = xhr.onloadend;
    xhr.responseType = responseType;
    xhr.open(method, u.href, true);
    for (const key in headers) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.send(body);
  });

  function collapseUsoVars(url) {
    if (queryPos < 0 ||
        url.length < 2000 ||
        !url.startsWith(URLS.userstylesOrgJson) ||
        !/^get$/i.test(method)) {
      return url;
    }
    const params = new URLSearchParams(url.slice(queryPos + 1));
    for (const [k, v] of params.entries()) {
      if (v.length < 10 || v.startsWith('ik-')) continue;
      usoVars.push(v);
      params.set(k, `\x01${usoVars.length}\x02`);
    }
    return url.slice(0, queryPos + 1) + params.toString();
  }

  function expandUsoVars(response) {
    if (!usoVars.length || !response) return response;
    const isText = typeof response === 'string';
    const json = isText && tryJSONparse(response) || response;
    json.updateUrl = url;
    for (const section of json.sections || []) {
      const {code} = section;
      if (code.includes('\x01')) {
        section.code = code.replace(/\x01(\d+)\x02/g, (_, num) => usoVars[num - 1] || '');
      }
    }
    return isText ? JSON.stringify(json) : json;
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

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}
