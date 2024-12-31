/**
 * WARNING!
 * Used in limited contexts such as the offscreen document.
 * Only for pure declarations with no side effects or marked with /*@__PURE__*/
import {kResolve} from './consts';

export const capitalize = s => s.slice(0, 1).toUpperCase() + s.slice(1);
export const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
export const clipString = (str, limit = 100) => str.length > limit
  ? str.substr(0, limit) + '...'
  : str;
export const getHost = url => url.split('/', 3)[2];
export const hasOwn = /*@__PURE__*/Object.call.bind({}.hasOwnProperty);
/** FYI, matchMedia's onchange doesn't work in bg context, so we use it in our content script */
export const isCssDarkScheme = () => matchMedia('(prefers-color-scheme:dark)').matches;
export const isObject = val => typeof val === 'object' && val;
export const sleep = ms => new Promise(ms > 0 ? cb => setTimeout(cb, ms) : setTimeout);
export const stringAsRegExpStr = s => s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
export const stringAsRegExp = (s, flags) => new RegExp(stringAsRegExpStr(s), flags);
/** @return {Promise & {resolve: function}} */
export const promiseWithResolve = _ => Object.assign(new Promise(cb => (_ = cb)), {[kResolve]: _});
export const RX_META = /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i;

const tCache = {};

export const t = (key, params, strict = true) => {
  const cached = !params && tCache[key];
  const s = cached || chrome.i18n.getMessage(key, params);
  if (!s && strict) throw `Missing string "${key}"`;
  if (!params) tCache[key] = s;
  return s;
};

export const debounce = /*@__PURE__*/(() => {
  const timers = new Map();
  return Object.assign((fn, delay, ...args) => {
    delay = +delay || 0;
    const time = performance.now() + delay;
    let old = timers.get(fn);
    if (!old) {
      timers.set(fn, old = {});
    } else if (delay && old.time < time) {
      clearTimer(old);
    } else if (old.args.length === args.length && old.args.every((a, i) => a === args[i])) {
      // Not using deepEqual because a different object reference means a different `args`
      return;
    }
    old.args = args;
    old.time = time;
    old.timer = setTimeout(run, delay, fn, args, __.ENTRY === 'sw' && delay && (
      old[kResolve] = __.KEEP_ALIVE(promiseWithResolve())[kResolve]
    ));
  }, {
    timers,
    run,
    unregister(fn) {
      const data = timers.get(fn);
      if (data) {
        clearTimer(data);
        timers.delete(fn);
      }
    },
  });
  function clearTimer(data) {
    clearTimeout(data.timer);
    if (__.ENTRY === 'sw' && (data = data[kResolve])) data();
  }
  async function run(fn, args, resolve) {
    timers.delete(fn);
    if (__.ENTRY === 'sw' && resolve) resolve(fn(...args));
    else fn(...args);
  }
})();

export const makePropertyPopProxy = data => new Proxy(data, {
  get: (obj, k, v) => ((
    (v = obj[k]),
    delete obj[k],
    v
  )),
});

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
 * @param {T} obj
 * @param {function(val:V, key:keyof T, obj:T):V} [fn]
 * @param {string[]} [keys]
 * @returns {Record<keyof T, V>}
 * @template T, V
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
  } catch {}
}

export function tryJSONparse(jsonString) {
  try {
    if (jsonString) return JSON.parse(jsonString);
  } catch {}
}

export function tryURL(url) {
  try {
    if (url) return new URL(url);
  } catch {}
  return ''; // allows `res.prop` without checking res first
}

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

/**
 * Useful in arr.map(deepCopy) to ignore the extra parameters passed by map()
 * @template T
 * @param {T} src
 * @return {T}
 */
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

/**
 * @param {string | URL | Request} url
 * @param {RequestInit} [opts]
 * @return {Promise<string>}
 */
export async function fetchText(url, opts) {
  return (await fetch(url, opts)).text();
}

/** @this {Object} DriveOptions */
export function fetchWebDAV(url, init = {}) {
  return fetch(url, {
    ...init,
    credentials: 'omit', // circumventing nextcloud CSRF token error
    headers: {
      ...init.headers,
      Authorization: `Basic ${btoa(`${this.username || ''}:${this.password || ''}`)}`,
    },
  });
}

/** A simple polyfill in case DOM storage is disabled in the browser */
export let sessionStore = /*@__PURE__*/ new Proxy({}, {
  get(target, name) {
    try {
      const val = sessionStorage[name];
      sessionStore = sessionStorage;
      return val;
    } catch {
      Object.defineProperty(window, 'sessionStorage', {value: target});
    }
  },
  set(target, name, value) {
    try {
      sessionStorage[name] = `${value}`;
      sessionStore = sessionStorage;
    } catch {
      this.get(target);
      target[name] = `${value}`;
    }
    return true;
  },
  deleteProperty(target, name) {
    return delete target[name];
  },
});
