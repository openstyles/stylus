import {kResolve, kStateDB} from '/js/consts';
import {CHROME} from '/js/ua';
import {promiseWithResolve} from '/js/util';
import {browserWindows} from '/js/util-webext';
import {getDbProxy} from './db';

export let bgBusy = promiseWithResolve();
/** Minimal init for a wake-up event */
export const bgPreInit = [];
export const bgInit = [];

export const safeTimeout = process.env.ENTRY === 'sw'
  ? (fn, delay, ...args) =>
    setTimeout(safeTimeoutResolve, delay, fn, args,
      process.env.KEEP_ALIVE(promiseWithResolve())[kResolve])
  : setTimeout;

const safeTimeoutResolve = process.env.ENTRY === 'sw'
  && ((fn, args, resolve) => resolve(fn(...args)));

export const stateDB = process.env.MV3 && getDbProxy(kStateDB, {store: 'kv'});

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

window._busy = bgBusy;
bgBusy.then(() => (bgBusy = null));
