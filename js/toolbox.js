/* global msg */
'use strict';

/* exported
  CHROME_POPUP_BORDER_BUG
  FIREFOX
  RX_META
  UA
  capitalize
  clamp
  clipString
  closeCurrentTab
  deepEqual
  getActiveTab
  getOwnTab
  getTab
  ignoreChromeError
  isEmptyObj
  mapObj
  sessionStore
  stringAsRegExp
  stringAsRegExpStr
  tryCatch
  tryJSONparse
  tryRegExp
  tryURL
  waitForTabUrl
*/

const [CHROME, FIREFOX, UA] = (() => {
  const uad = navigator.userAgentData;
  const ua = uad || navigator.userAgent;
  const brands = uad ? uad.brands.map(_ => `${_.brand}/${_.version}`).join(' ') : ua;
  const getVer = name => Number(brands.match(new RegExp(name + '\\w*/(\\d+)|$'))[1]) || false;
  const platform = uad ? uad.platform : ua;
  return [
    getVer('Chrom'),
    !chrome.app && getVer('Firefox'),
    {
      mac: /mac/i.test(platform),
      mobile: uad ? uad.mobile : /Android/.test(ua),
      windows: /Windows/.test(platform),
      opera: getVer('(Opera|OPR)'),
      vivaldi: getVer('Vivaldi'),
    },
  ];
})();

// see PR #781
const CHROME_POPUP_BORDER_BUG = CHROME >= 62 && CHROME <= 74;

const capitalize = s => s.slice(0, 1).toUpperCase() + s.slice(1);
const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
const clipString = (str, limit = 100) => str.length > limit ? str.substr(0, limit) + '...' : str;
const getOwnTab = () => browser.tabs.getCurrent();
const getActiveTab = async () => (await browser.tabs.query({currentWindow: true, active: true}))[0];
const hasOwn = Object.call.bind({}.hasOwnProperty);
const ignoreChromeError = () => { chrome.runtime.lastError; /*eslint-disable-line no-unused-expressions*/ };
const stringAsRegExpStr = s => s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
const stringAsRegExp = (s, flags) => new RegExp(stringAsRegExpStr(s), flags);

const URLS = {
  ownOrigin: chrome.runtime.getURL(''),

  configureCommands:
    UA.opera ? 'opera://settings/configureCommands'
          : 'chrome://extensions/configureCommands',

  installUsercss: chrome.runtime.getURL('install-usercss.html'),

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

  favicon: host => `https://icons.duckduckgo.com/ip3/${host}.ico`,

  // Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/
  // TODO: remove when "minimum_chrome_version": "61" or higher
  chromeProtectsNTP: CHROME >= 61,

  uso: 'https://userstyles.org/',
  usoApi: 'https://gateway.userstyles.org/styles/getStyle',
  usoJson: 'https://userstyles.org/styles/chrome/',

  usoa: 'https://uso.kkx.one/',
  usoaRaw: [
    // The newest URL first!
    'https://cdn.jsdelivr.net/gh/uso-archive/data@flomaster/data/',
    'https://cdn.jsdelivr.net/gh/33kk/uso-archive@flomaster/data/',
    'https://raw.githubusercontent.com/33kk/uso-archive/flomaster/data/',
  ],

  usw: 'https://userstyles.world/',

  extractUsoaId: url =>
    url &&
    URLS.usoaRaw.some(u => url.startsWith(u)) &&
    +url.match(/\/(\d+)\.user\.css|$/)[1],
  extractUswId: url =>
    url &&
    url.startsWith(URLS.usw) &&
    +url.match(/\/(\d+)\.user\.css|$/)[1],
  makeInstallUrl: url => {
    let id;
    return ((id = URLS.extractUsoaId(url))) ? `${URLS.usoa}style/${id}`
      : ((id = URLS.extractUswId(url))) ? `${URLS.usw}style/${id}`
        : /^(https:\/\/(?:greasy|sleazy)fork\.org\/scripts\/\d+)[^/]*\/code\/[^/]*\.user\.css$|$/
          .exec(url)[1]
        || '';
  },

  supported: (url, allowOwn = true) => (
    url.startsWith('http') ||
    url.startsWith('ftp') ||
    url.startsWith('file') ||
    allowOwn && url.startsWith(URLS.ownOrigin) ||
    !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
  ),

  isLocalhost: url => /^file:|^https?:\/\/([^/]+@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url),
};

const RX_META = /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i;

if (CHROME < 61) { // TODO: remove when minimum_chrome_version >= 61
  window.URLSearchParams = class extends URLSearchParams {
    constructor(init) {
      if (init && typeof init === 'object') {
        super();
        for (const [key, val] of init[Symbol.iterator] ? init : Object.entries(init)) {
          this.set(key, val);
        }
      } else {
        super(...arguments);
      }
    }
  };
}

window.msg = window.msg || {
  bg: chrome.extension.getBackgroundPage(),
  needsTab: [
    'updateIconBadge',
    'styleViaAPI',
  ],
  async invokeAPI(path, message) {
    let tab = false;
    // Using a fake id for our Options frame as we want to fetch styles early
    const frameId = window === top ? 0 : 1;
    if (!msg.needsTab.includes(path[0]) || !frameId && (tab = await getOwnTab())) {
      const res = await msg.bg.msg._execute('extension',
        msg.bg.deepCopy(message),
        msg.bg.deepCopy({url: location.href, tab, frameId}));
      return deepCopy(res);
    }
  },
};

async function require(urls, cb) { /* exported require */// eslint-disable-line no-redeclare
  const promises = [];
  const all = [];
  const toLoad = [];
  for (let url of Array.isArray(urls) ? urls : [urls]) {
    const isCss = url.endsWith('.css');
    const tag = isCss ? 'link' : 'script';
    const attr = isCss ? 'href' : 'src';
    if (!isCss && !url.endsWith('.js')) url += '.js';
    if (url[0] === '/' && location.pathname.indexOf('/', 1) < 0) url = url.slice(1);
    let el = document.head.querySelector(`${tag}[${attr}$="${url}"]`);
    if (!el) {
      el = document.createElement(tag);
      toLoad.push(el);
      require.promises[url] = new Promise((resolve, reject) => {
        el.onload = resolve;
        el.onerror = reject;
        el[attr] = url;
        if (isCss) el.rel = 'stylesheet';
      }).catch(console.warn);
    }
    promises.push(require.promises[url]);
    all.push(el);
  }
  if (toLoad.length) document.head.append(...toLoad);
  if (promises.length) await Promise.all(promises);
  if (cb) cb(...all);
  return all[0];
}
require.promises = {};

function isEmptyObj(obj) {
  if (obj) {
    for (const k in obj) {
      if (hasOwn(obj, k)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * @param {?Object} obj
 * @param {function(val:?, key:string, obj:Object):T} [fn]
 * @param {string[]} [keys]
 * @returns {?Object<string,T>}
 * @template T
 */
function mapObj(obj, fn, keys) {
  if (!obj) return obj;
  const res = {};
  for (const k of keys || Object.keys(obj)) {
    if (!keys || k in obj) {
      res[k] = fn ? fn(obj[k], k, obj) : obj[k];
    }
  }
  return res;
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

function tryURL(url) {
  try {
    if (url) return new URL(url);
  } catch (e) {}
  return ''; // allows `res.prop` without checking res first
}

function debounce(fn, delay, ...args) {
  delay = +delay || 0;
  const t = performance.now() + delay;
  let old = debounce.timers.get(fn);
  if (!old && debounce.timers.set(fn, old = {})
    || delay && old.time < t && (clearTimeout(old.timer), true)
    || old.args.length !== args.length
    || old.args.some((a, i) => a !== args[i]) // note that we can't use deepEqual here
  ) {
    old.args = args;
    old.time = t;
    old.timer = setTimeout(debounce.run, delay, fn, args);
  }
}

Object.assign(debounce, {
  timers: new Map(),
  run(fn, args) {
    debounce.timers.delete(fn);
    fn(...args);
  },
  unregister(fn) {
    const data = debounce.timers.get(fn);
    if (data) {
      clearTimeout(data.timer);
      debounce.timers.delete(fn);
    }
  },
});

function deepMerge(src, dst, mergeArrays) {
  if (!src || typeof src !== 'object') {
    return src;
  }
  if (Array.isArray(src)) {
    // using `Array` that belongs to this `window`; not using Array.from as it's slower
    if (!dst || !mergeArrays) dst = Array.prototype.map.call(src, deepCopy);
    else for (const v of src) dst.push(deepMerge(v));
  } else {
    // using an explicit {} that belongs to this `window`
    if (!dst) dst = {};
    for (const [k, v] of Object.entries(src)) {
      dst[k] = deepMerge(v, dst[k]);
    }
  }
  return dst;
}

/** Useful in arr.map(deepCopy) to ignore the extra parameters passed by map() */
function deepCopy(src) {
  return deepMerge(src);
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
    if (!hasOwn(a, key) || ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!hasOwn(b, key)) return false;
    if (!deepEqual(a[key], b[key], ignoredKeys)) return false;
  }
  for (const key in b) {
    if (!hasOwn(b, key) || ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!hasOwn(a, key)) return false;
  }
  return true;
}

/* A simple polyfill in case DOM storage is disabled in the browser */
let sessionStore = new Proxy({}, {
  get(target, name) {
    try {
      const val = sessionStorage[name];
      sessionStore = sessionStorage;
      return val;
    } catch (e) {
      Object.defineProperty(window, 'sessionStorage', {value: target});
    }
  },
  set(target, name, value) {
    try {
      sessionStorage[name] = `${value}`;
      sessionStore = sessionStorage;
    } catch (e) {
      this.get(target);
      target[name] = `${value}`;
    }
    return true;
  },
  deleteProperty(target, name) {
    return delete target[name];
  },
});

async function closeCurrentTab() {
  // https://bugzil.la/1409375
  const tab = await getOwnTab();
  if (tab) return chrome.tabs.remove(tab.id);
}
