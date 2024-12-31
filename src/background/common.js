import {k_busy, kStateDB} from '@/js/consts';
import {createPortProxy} from '@/js/port';
import {CHROME} from '@/js/ua';
import {workerPath} from '@/js/urls';
import {promiseWithResolve, sleep} from '@/js/util';
import {browserWindows} from '@/js/util-webext';
import {getDbProxy} from './db';
import offscreen from './offscreen';

export let bgBusy = promiseWithResolve();
/** Minimal init for a wake-up event */
export const bgPreInit = [];
export const bgInit = [];

const CLIENT_TIMEOUT = 100;
export const clientDataJobs = {};

export const getClient = async () => {
  for (let busy, job, tEnd;
      !tEnd || performance.now() < tEnd;
      tEnd ??= performance.now() + CLIENT_TIMEOUT) {
    for (const client of await getWindowClients()) {
      if ((job = clientDataJobs[client.url])) {
        (busy ??= []).push(job);
      } else {
        return client;
      }
    }
    if (!busy || !await Promise.race([
      Promise.any(busy).catch(() => 0),
      sleep(CLIENT_TIMEOUT),
    ])) break;
  }
};

/** @return {WindowClient[]} */
export const getWindowClients = () => self.clients.matchAll({
  includeUncontrolled: true,
  type: 'window',
});

export const stateDB = __.MV3 && getDbProxy(kStateDB, {store: 'kv'});

export const uuidIndex = Object.assign(new Map(), {
  custom: {},
  /** `obj` must have a unique `id`, a UUIDv4 `_id`, and Date.now() for `_rev`. */
  addCustom(obj, {get = () => obj, set}) {
    Object.defineProperty(uuidIndex.custom, obj._id, {get, set});
  },
});

/** @type {WorkerAPI} */
export const worker = !__.MV3
  ? createPortProxy(workerPath)
  : createPortProxy(async () => {
    const client = await getClient();
    const proxy = client ? createPortProxy(client, {once: true}) : offscreen;
    return proxy.getWorkerPort(workerPath);
  }, {lock: workerPath});

export let isVivaldi = !!(browserWindows && CHROME) && (async () => {
  const wnd = (await browserWindows.getAll())[0] ||
    await new Promise(resolve => browserWindows.onCreated.addListener(function onCreated(w) {
      browserWindows.onCreated.removeListener(onCreated);
      resolve(w);
    }));
  isVivaldi = !!(wnd && (wnd.vivExtData || wnd.extData));
  return isVivaldi;
})();

global[k_busy] = bgBusy;
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
