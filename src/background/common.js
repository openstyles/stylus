import {k_busy, kResolve} from '@/js/consts';
import {CHROME} from '@/js/ua';
import {browserWindows} from '@/js/util-webext';

/** Minimal init for a wake-up event */
export const bgPreInit = [];
export const bgInit = [];
/** @type {Map<string,Promise>} */
export const clientDataJobs = __.MV3 && new Map();

/** Temporary storage for data needed elsewhere e.g. in a content script */
export const dataHub = {
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
};
const data = {__proto__: null};

/** @type {Set<(isDark: boolean) => ?>} */
export const onSchemeChange = new Set();
/** @type {Set<(tabId: number, url: string, oldUrl?: string) => ?>} */
export const onTabUrlChange = new Set();
/** @type {Set<(tabId: number, frameId: number, port: chrome.runtime.Port) => ?>} */
export const onUnload = new Set();
/** @type {Set<(data: Object, type: 'committed'|'history'|'hash') => ?>} */
export const onUrlChange = new Set();

export const uuidIndex = Object.assign(new Map(), {
  custom: {},
  /** `obj` must have a unique `id`, a UUIDv4 `_id`, and Date.now() for `_rev`. */
  addCustom(obj, {get = () => obj, set}) {
    Object.defineProperty(uuidIndex.custom, obj._id, {get, set});
  },
});

export let isVivaldi = !!(browserWindows && CHROME) && (async () => {
  const wnd = (await browserWindows.getAll())[0] ||
    await new Promise(resolve => browserWindows.onCreated.addListener(function onCreated(w) {
      browserWindows.onCreated.removeListener(onCreated);
      resolve(w);
    }));
  isVivaldi = !!(wnd && (wnd.vivExtData || wnd.extData));
  return isVivaldi;
})();

export let bgBusy = global[k_busy] = (_ =>
  Object.assign(new Promise(cb => (_ = cb)), {[kResolve]: _})
)();

bgBusy.then(() => {
  bgBusy = null;
  delete global[k_busy];
});

if (__.DEBUG) {
  global._bgPreInit = bgPreInit;
  global._bgInit = bgInit;
  bgPreInit.push = (...args) => {
    const {stack} = new Error();
    for (const a of args) if (a && typeof a === 'object') a._stack = stack;
    return [].push.apply(bgPreInit, args);
  };
}
