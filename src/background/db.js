import {CACHE_DB, DB, STATE_DB} from '@/js/consts';
import {API} from '@/js/msg-api';
import {CLIENT} from '@/js/port';
import {STORAGE_KEY, subscribe} from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import {CHROME} from '@/js/ua';
import {deepMerge} from '@/js/util';
import ChromeStorageDB from './db-chrome-storage';
import offscreen, {offscreenCache} from './offscreen';
import {offloadCache} from './style-manager/util';

/*
 Initialize a database. There are some problems using IndexedDB in Firefox:
 https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/
 Some of them are fixed in FF59:
 https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/

let exec = __.BUILD === 'chrome' || CHROME
  ? dbExecIndexedDB
  : tryUsingIndexedDB;
const cachedClient = new WeakSet();
const FALLBACK = 'dbInChromeStorage';
const REASON = FALLBACK + 'Reason';
const DRAFTS_DB = 'drafts';
const CACHING = {
  [DRAFTS_DB]: cachedExec,
  [STORAGE_KEY]: __.MV3 ? cachedExecOffscreen : cachedExec,
};
const CACHING2 = {};
const DATA_KEY = {};
const STORES = {};
const VERSIONS = {};
const dataCache = {};
const proxies = {};
const databases = {};
const proxyHandler = {
  get: ({dbName}, cmd) => (CACHING[dbName] || exec).bind(null, dbName, cmd),
};
const getAll = (range, map) => range instanceof IDBKeyRange
  ? [...map.keys()].filter(range.includes, range).map(map.get, map)
  : [...map.values()];
/**
 * @param {string} dbName
 * @param {object} [cfg]
 * @param {boolean|string} [cfg.id] - object's prop to be used as a db key
 * @param {string} [cfg.store]
 * @return {IDBObjectStoreMany}
 */
const getDbProxy = (dbName, {
  id,
  store = 'data',
  ver = 2,
} = {}) => (proxies[dbName] ??= (
  (DATA_KEY[dbName] = !id || typeof id === 'string' ? id : 'id'),
  (STORES[dbName] = store),
  (VERSIONS[dbName] = ver),
  new Proxy({dbName}, proxyHandler)
));

export const cacheDB = getDbProxy(CACHE_DB, {id: 'url'});
export const db = getDbProxy(DB, {id: true, store: 'styles'});
export const draftsDb = getDbProxy(DRAFTS_DB);
/** Storage for big items that may exceed 8kB limit of chrome.storage.sync.
 * To make an item syncable register it with uuidIndex.addCustom. */
export const prefsDb = getDbProxy(STORAGE_KEY);
export const stateDB = __.MV3 && getDbProxy(STATE_DB, {store: 'kv'});

if (__.MV3) {
  const toggleOffscreenCache = val => {
    CACHING[CACHE_DB] = CACHING[DB] = CACHING[STATE_DB] = val
      ? cachedExecOffscreen
      : cachedExec;
    if (!val && offscreen[CLIENT])
      offscreen.dbCache(null);
  };
  toggleOffscreenCache(true);
  CACHING2[STORAGE_KEY] = CACHING2[STATE_DB] = cachedExec;
  subscribe('keepAliveCache', (key, val) => toggleOffscreenCache(val), true);
}

Object.assign(API, /** @namespace API */ {
  draftsDb,
  prefsDb,
});

async function cachedExec(dbName, cmd, a, b) {
  const old = dataCache[dbName];
  const hub = old || (dataCache[dbName] = new Map());
  const res = cmd === 'get' && hub.has(a)
    ? hub.get(a)
    : old && (
      cmd === 'getAll' ? getAll(a, hub)
        : cmd === 'getMany' && a.map(hub.get, hub)
    ) || await exec(...arguments);
  switch (cmd) {
    case 'put':
      cmd = DATA_KEY[dbName];
      hub.set(cmd ? a[cmd] : b, deepMerge(a));
      break;
    case 'putMany':
      cmd = DATA_KEY[dbName];
      for (b of a) hub.set(b[cmd], deepMerge(b));
      break;
    case 'deleteMany':
      a.forEach(hub.delete, hub);
      break;
    case 'delete':
    case 'clear':
      hub[cmd](a);
      break;
  }
  return res && typeof res === 'object' ? deepMerge(res) : res;
}

async function cachedExecOffscreen(dbName, cmd, a, b) {
  let res, client, isRead;
  if ((isRead = cmd.startsWith('get'))
  && offscreenCache
  && await offscreenCache
  && (res = offscreenCache[dbName])) {
    return cmd === 'get' ? res.get(a)
      : cmd === 'getMany' ? a.map(res.get, res)
        : getAll(a, res);
  }
  if ((client = offscreen[CLIENT]) && !cachedClient.has(client)) {
    cachedClient.add(client);
    if (!offscreenCache) {
      offloadCache(dataCache);
      client = null;
    }
  }
  if (client && !isRead)
    offscreen.dbCache(dbName, cmd, a, b, DATA_KEY[dbName]);
  res = await (CACHING2[dbName] || exec)(dbName, cmd, a, b);
  if (client && isRead)
    offscreen.dbCache(dbName, 'res:' + cmd, res, a, DATA_KEY[dbName]);
  return res;
}

async function tryUsingIndexedDB(...args) {
  // we use chrome.storage.local fallback if IndexedDB doesn't save data,
  // which, once detected on the first run, is remembered in chrome.storage.local
  // note that accessing indexedDB may throw, https://github.com/openstyles/stylus/issues/615
  let err;
  if (typeof indexedDB === 'undefined') {
    err = new Error('IndexedDB is disabled in the browser');
  } else {
    try {
      const [res, fallback = await testDB()] = await Promise.all([
        dbExecIndexedDB(...args),
        chromeLocal.getValue(FALLBACK),
      ]);
      if (!fallback) {
        exec = dbExecIndexedDB;
        return res;
      }
      // TODO: show this in the manager and allow exporting/switching the other DB
      console.warn('IndexedDB is not used due to a previous failure, but seems functional now:', {
        previousFailure: await chromeLocal.getValue(REASON),
        currentResult: res,
        arguments: args,
      });
    } catch (e) {
      err = e;
    }
  }
  exec = useChromeStorage(err);
  return exec(...args);
}

async function testDB() {
  const id = `${performance.now()}.${Math.random()}.${Date.now()}`;
  await dbExecIndexedDB(DB, 'put', {id});
  const e = await dbExecIndexedDB(DB, 'get', id);
  await dbExecIndexedDB(DB, 'delete', e.id); // throws if `e` or id is null
}

async function useChromeStorage(err) {
  if (err) {
    chromeLocal.set({
      [FALLBACK]: true,
      [REASON]: err.message + (err.stack ? '\n' + err.stack : ''),
    });
    console.warn('Failed to access IndexedDB. Switched to extension storage API.', err);
  }
  const BASES = {};
  return (dbName, method, ...args) => (
    BASES[dbName] || (
      BASES[dbName] = ChromeStorageDB(dbName !== DB && `${dbName}-`)
    )
  )[method](...args);
}

async function dbExecIndexedDB(dbName, method, ...args) {
  const mode = method.startsWith('get') ? 'readonly' : 'readwrite';
  const storeName = STORES[dbName];
  const store = (databases[dbName] ??= await open(dbName))
    .transaction([storeName], mode)
    .objectStore(storeName);
  return method.endsWith('Many')
    ? storeMany(store, method.slice(0, -4), args[0])
    : new Promise((resolve, reject) => {
      /** @type {IDBRequest} */
      const request = store[method](...args);
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
}

function storeMany(store, method, items) {
  let num = 0;
  let resolve, reject;
  const p = new Promise((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  const results = [];
  /** @param {IDBRequest} req */
  const onsuccess = ({target: req}) => {
    results[req.i] = req.result;
    if (!--num) resolve(results);
  };
  for (const item of items) {
    /** @type {IDBRequest} */
    const req = store[method](item);
    req.onerror = reject;
    req.onsuccess = onsuccess;
    req.i = num;
    results[num] = null; // avoiding holes in case the results come out of order
    num++;
  }
  return p;
}

function open(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, VERSIONS[name]);
    request.onsuccess = e => resolve(create(e));
    request.onerror = reject;
    request.onupgradeneeded = create;
  });
}

function create(event) {
  /** @type {IDBDatabase} */
  const idb = event.target.result;
  const dbName = idb.name;
  const sn = STORES[dbName];
  if (!idb.objectStoreNames.contains(sn)) {
    if (event.type === 'success') {
      idb.close();
      return new Promise(resolve => {
        indexedDB.deleteDatabase(dbName).onsuccess = () => {
          resolve(open(dbName));
        };
      });
    }
    idb.createObjectStore(sn, DATA_KEY[dbName] ? {
      keyPath: DATA_KEY[dbName],
      autoIncrement: true,
    } : undefined);
  }
  return idb;
}
