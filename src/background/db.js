import {API} from '/js/msg';
import {STORAGE_KEY} from '/js/prefs';
import {chromeLocal} from '/js/storage-util';
import {CHROME} from '/js/ua';
import {deepCopy} from '/js/util';
import ChromeStorageDB from './db-chrome-storage';

/*
 Initialize a database. There are some problems using IndexedDB in Firefox:
 https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/
 Some of them are fixed in FF59:
 https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/

let exec = process.env.BUILD === 'chrome' || CHROME
  ? dbExecIndexedDB
  : tryUsingIndexedDB;
const DB = 'stylish';
const FALLBACK = 'dbInChromeStorage';
const REASON = FALLBACK + 'Reason';
const ID_AS_KEY = {};
const getStoreName = dbName => dbName === DB ? 'styles' : 'data';
const cache = {};
const proxies = {};
const proxyHandler = {
  get: ({dbName}, cmd) => (dbName === DB ? exec : cachedExec).bind(null, dbName, cmd),
};
/**
 * @param {string} dbName
 * @return {IDBObjectStore | {putMany: function(items:?[]):Promise<?[]>}}
 */
export const getDbProxy = (dbName, idAsKey) => (proxies[dbName] ??= (
  (ID_AS_KEY[dbName] = !!idAsKey),
  new Proxy({dbName}, proxyHandler)
));

export const db = getDbProxy(DB, true);

Object.assign(API, /** @namespace API */ {
  drafts: getDbProxy('drafts'),
  /** Storage for big items that may exceed 8kB limit of chrome.storage.sync.
   * To make an item syncable register it with uuidIndex.addCustom. */
  prefsDb: getDbProxy(STORAGE_KEY),
});

async function cachedExec(dbName, cmd, a, b) {
  const hub = cache[dbName] || (cache[dbName] = {});
  const res = cmd === 'get' && a in hub ? hub[a] : await exec(...arguments);
  if (cmd === 'get') {
    hub[a] = deepCopy(res);
  } else if (cmd === 'put') {
    hub[ID_AS_KEY[dbName] ? a.id : b] = deepCopy(a);
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
  const storeName = getStoreName(dbName);
  const store = (await open(dbName)).transaction([storeName], mode).objectStore(storeName);
  const fn = method === 'putMany' ? putMany : storeRequest;
  return fn(store, method, ...args);
}

function storeRequest(store, method, ...args) {
  return new Promise((resolve, reject) => {
    /** @type {IDBRequest} */
    const request = store[method](...args);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
}

function putMany(store, _method, items) {
  return Promise.all(items.map(item => storeRequest(store, 'put', item)));
}

function open(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onsuccess = e => resolve(create(e));
    request.onerror = reject;
    request.onupgradeneeded = create;
  });
}

function create(event) {
  /** @type IDBDatabase */
  const idb = event.target.result;
  const dbName = idb.name;
  const sn = getStoreName(dbName);
  if (!idb.objectStoreNames.contains(sn)) {
    if (event.type === 'success') {
      idb.close();
      return new Promise(resolve => {
        indexedDB.deleteDatabase(dbName).onsuccess = () => {
          resolve(open(dbName));
        };
      });
    }
    idb.createObjectStore(sn, ID_AS_KEY[dbName] ? {
      keyPath: 'id',
      autoIncrement: true,
    } : undefined);
  }
  return idb;
}
