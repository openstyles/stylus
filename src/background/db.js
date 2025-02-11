import {CACHE_DB, DB, kContentType, kInjectionOrder, STATE_DB, UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import {STORAGE_KEY} from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import {CHROME} from '@/js/ua';
import {deepMerge, sleep} from '@/js/util';
import ChromeStorageDB from './db-chrome-storage';

/*
 Initialize a database. There are some problems using IndexedDB in Firefox:
 https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/
 Some of them are fixed in FF59:
 https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/

let exec = __.BUILD === 'chrome' || CHROME
  ? dbExecIndexedDB
  : tryUsingIndexedDB;
const FALLBACK = 'dbInChromeStorage';
const REASON = FALLBACK + 'Reason';
const DRAFTS_DB = 'drafts';
const CACHING = {
  [DRAFTS_DB]: cachedExec,
  [STORAGE_KEY]: cachedExec,
};
const {CompressionStream} = global;
const kApplicationGzip = 'application/gzip';
const MIRROR_INIT = CompressionStream && {headers: {[kContentType]: kApplicationGzip}};
const MIRROR_PREFIX = 'http://_/';
/** @type {{[id: string]: Cache}} */
const MIRROR = {
  [DB]: null,
  [STORAGE_KEY]: null,
};
const DATA_KEY = {};
const STORES = {};
const VERSIONS = {};
const dataCache = {};
const proxies = {};
const databases = {};
const chromeBases = {};
const proxyHandler = {
  get: ({dbName}, cmd) => (CACHING[dbName] || exec).bind(null, dbName, cmd),
};
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

/** @type {IDBObjectStoreMany} */
export const cacheDB = __.MV3 && getDbProxy(CACHE_DB, {id: 'url'});
export const db = getDbProxy(DB, {id: true, store: 'styles'});
export const draftsDB = getDbProxy(DRAFTS_DB);
/** Storage for big items that may exceed 8kB limit of chrome.storage.sync.
 * To make an item syncable register it with uuidIndex.addCustom. */
export const prefsDB = getDbProxy(STORAGE_KEY);
/** @type {IDBObjectStoreMany} */
export const stateDB = __.MV3 && getDbProxy(STATE_DB, {store: 'kv'});

Object.assign(API, /** @namespace API */ {
  draftsDB,
  prefsDB,
});

async function cachedExec(dbName, cmd, a, b) {
  const hub = dataCache[dbName] ??= {};
  const res = cmd === 'get' && a in hub ? hub[a] : await exec(...arguments);
  if (cmd === 'get') {
    hub[a] = deepMerge(res);
  } else if (cmd === 'put') {
    const key = DATA_KEY[dbName];
    hub[key ? a[key] : b] = deepMerge(a);
  } else if (cmd === 'delete') {
    delete hub[a];
  }
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

function useChromeStorage(err) {
  if (err) {
    chromeLocal.set({
      [FALLBACK]: true,
      [REASON]: err.message + (err.stack ? '\n' + err.stack : ''),
    });
    console.warn('Failed to access IndexedDB. Switched to extension storage API.', err);
  }
  return (dbName, method, ...args) =>
    (chromeBases[dbName] ??= new ChromeStorageDB(dbName))[method](...args);
}

async function dbExecIndexedDB(dbName, method, ...args) {
  const mode = method.startsWith('get') ? undefined : 'readwrite';
  const storeName = STORES[dbName];
  const store = (databases[dbName] ??= await open(dbName))
    .transaction([storeName], mode)
    .objectStore(storeName);
  if (mode && dbName in MIRROR)
    execMirror(...arguments);
  return method.endsWith('Many')
    ? storeMany(store, method.slice(0, -4), ...args)
    : new Promise((resolve, reject) => {
      /** @type {IDBRequest} */
      const request = store[method](...args);
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
}

function storeMany(store, method, items, keys) {
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
  while (num < items.length) {
    /** @type {IDBRequest} */
    const req = store[method](items[num], keys?.[num]);
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

export async function execMirror(dbName, method, a, b) {
  const mirror = MIRROR[dbName] ??= await caches.open(dbName);
  switch (method) {
    case 'delete':
      return mirror.delete(MIRROR_PREFIX + a);
    case 'get':
      b = await execMirror(dbName, 'getAll', a);
      return b[0];
    case 'getAll':
      a = await mirror.matchAll(a);
      for (let i = 0; i < a.length; i++) {
        b = a[i];
        if (MIRROR_INIT && b.headers.get(kContentType) === kApplicationGzip)
          b = new Response(b.body.pipeThrough(new DecompressionStream('gzip')));
        a[i] = b.text();
      }
      a = await Promise.all(a);
      for (let i = 0; i < a.length; i++)
        a[i] = JSON.parse(a[i]);
      return a;
    case 'put':
      await sleep(10);
      if (dbName === DB && a[UCD])
        delete (a = {...a}).sections;
      b = MIRROR_PREFIX + (b ?? a.id);
      a = JSON.stringify(a);
      if (MIRROR_INIT)
        MIRROR_INIT.headers['Content-Length'] = a.length;
      if (CompressionStream)
        a = new Response(a).body.pipeThrough(new CompressionStream('gzip'));
      return mirror.put(b, new Response(a, MIRROR_INIT));
    case 'putMany':
      for (let i = 0; i < a.length; i++)
        await execMirror(dbName, 'put', a[i], b?.[i]);
  }
}

export async function mirrorStorage(dataMap) {
  if (!await caches.has(DB)) {
    for (const {style} of dataMap.values())
      await execMirror(DB, 'put', style);
  }
  if (!await caches.has(STORAGE_KEY)) {
    for (const key of [kInjectionOrder]) {
      const val = await prefsDB.get(key);
      if (val) await execMirror(STORAGE_KEY, 'put', val, key);
    }
  }
}
