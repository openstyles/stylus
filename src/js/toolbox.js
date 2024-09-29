import browser from '/js/browser';

export const [CHROME, FIREFOX, UA] = (() => {
  const uad = navigator.userAgentData;
  const ua = uad || navigator.userAgent;
  const brands = uad ? uad.brands.map(_ => `${_.brand}/${_.version}`).join(' ') : ua;
  const getVer = name => +brands.match(new RegExp(name + '\\w*/(\\d+)|$'))[1];
  const platform = uad ? uad.platform : ua;
  const {app} = chrome;
  return [
    app && getVer('Chrom'),
    !app && getVer('Firefox') || NaN,
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
export const CHROME_POPUP_BORDER_BUG = CHROME >= 62 && CHROME <= 74;

export const capitalize = s => s.slice(0, 1).toUpperCase() + s.slice(1);
export const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
export const clipString = (str, limit = 100) => str.length > limit
  ? str.substr(0, limit) + '...'
  : str;
export const getOwnTab = () => browser.tabs.getCurrent();
export const getActiveTab = async () =>
  (await browser.tabs.query({currentWindow: true, active: true}))[0] ||
  // workaround for Chrome bug when devtools for our popup is focused
  (await browser.tabs.query({windowId: (await browser.windows.getCurrent()).id, active: true}))[0];
export const hasOwn = Object.call.bind({}.hasOwnProperty);
export const ignoreChromeError = () => chrome.runtime.lastError;
export const stringAsRegExpStr = s => s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
export const stringAsRegExp = (s, flags) => new RegExp(stringAsRegExpStr(s), flags);

export const UCD = 'usercssData';
export const URLS = {
  ownOrigin: chrome.runtime.getURL(''),

  configureCommands:
    UA.opera ? 'opera://settings/configureCommands'
          : 'chrome://extensions/configureCommands',

  installUsercss: chrome.runtime.getURL('install-usercss.html'),

  favicon: host => `https://icons.duckduckgo.com/ip3/${host}.ico`,

  // Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/
  chromeProtectsNTP: true,

  rxGF: /^(https:\/\/)(?:update\.)?((?:greasy|sleazy)fork\.org\/scripts\/)(\d+)[^/]*\/code\/[^/]*\.user\.css$|$/,

  uso: 'https://userstyles.org/',
  usoApi: 'https://gateway.userstyles.org/styles/getStyle',
  usoJson: 'https://userstyles.org/styles/chrome/',

  usoa: 'https://uso.kkx.one/',
  usoaRaw: [
    // The newest URL first!
    'https://cdn.jsdelivr.net/gh/uso-archive/data@flomaster/data/',
    'https://raw.githubusercontent.com/uso-archive/data/flomaster/data/',
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
  makeInstallUrl: (url, id) =>
    url === 'usoa' || !id && (id = URLS.extractUsoaId(url)) ? `${URLS.usoa}style/${id}` :
      url === 'usw' || !id && (id = URLS.extractUswId(url)) ? `${URLS.usw}style/${id}` :
        url === 'gf' || !id && (id = URLS.rxGF.exec(url)) ? id[1] + id[2] + id[3] :
          '',
  makeUpdateUrl: (url, id) =>
    url === 'usoa' || !id && (id = URLS.extractUsoaId(url))
      ? `${URLS.usoaRaw[0]}usercss/${id}.user.css` :
    url === 'usw' || !id && (id = URLS.extractUswId(url))
      ? `${URLS.usw}api/style/${id}.user.css` :
        '',

  supported: (url, allowOwn = true) => (
    url.startsWith('http') ||
    url.startsWith('ftp') ||
    url.startsWith('file') ||
    allowOwn && url.startsWith(URLS.ownOrigin) ||
    !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
  ),

  isLocalhost: url => /^file:|^https?:\/\/([^/]+@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url),
};

export const RX_META = /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i;

// TODO: remove when min_chrome_version > 112, strict_min_version > 112
if (!('size' in URLSearchParams.prototype)) {
  Object.defineProperty(URLSearchParams.prototype, 'size', {
    get() { return [...this.keys()].length; },
  });
}

const resourcePromises = {};

export async function require(urls, cb) {
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
      resourcePromises[url] = new Promise((resolve, reject) => {
        el.onload = resolve;
        el.onerror = reject;
        el[attr] = url;
        if (isCss) el.rel = 'stylesheet';
      }).catch(console.warn);
    }
    promises.push(resourcePromises[url]);
    all.push(el);
  }
  if (toLoad.length) document.head.append(...toLoad);
  if (promises.length) await Promise.all(promises);
  if (cb) cb(...all);
  return all[0];
}

export function isEmptyObj(obj) {
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
export function mapObj(obj, fn, keys) {
  if (!obj) return obj;
  const res = {};
  for (const k of keys || Object.keys(obj)) {
    if (!keys || k in obj) {
      res[k] = fn ? fn(obj[k], k, obj) : obj[k];
    }
  }
  return res;
}

export function tryRegExp(regexp, flags) {
  try {
    return new RegExp(regexp, flags);
  } catch (e) {}
}

export function tryJSONparse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {}
}

export function tryURL(url) {
  try {
    if (url) return new URL(url);
  } catch (e) {}
  return ''; // allows `res.prop` without checking res first
}

export function debounce(fn, delay, ...args) {
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

export function deepMerge(src, dst, mergeArrays) {
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
export function deepCopy(src) {
  return deepMerge(src);
}

export function deepEqual(a, b, ignoredKeys) {
  if (!a || !b || a === b /*same object ref*/) return a === b;
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
export let sessionStore = new Proxy({}, {
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

export async function closeCurrentTab() {
  // https://bugzil.la/1409375
  const tab = await getOwnTab();
  if (tab) return chrome.tabs.remove(tab.id);
}

export async function fetchText(url, opts) {
  return (await fetch(url, opts)).text();
}

self.deepCopy = deepCopy; // used by other views for cloning into this JS realm
