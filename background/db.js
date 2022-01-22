/* global chromeLocal */// storage-util.js
/* global cloneError */// worker-util.js
'use strict';

/*
 Initialize a database. There are some problems using IndexedDB in Firefox:
 https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/
 Some of them are fixed in FF59:
 https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/

/* exported db */
const db = (() => {
  let exec = async (...args) => (
    exec = await tryUsingIndexedDB().catch(useChromeStorage)
  )(...args);
  const DB = 'stylish';
  const FALLBACK = 'dbInChromeStorage';
  const proxies = {};
  const proxyHandler = {
    get: ({dbName}, cmd) => (...args) => exec(dbName, cmd, ...args),
  };
  const getProxy = (dbName = DB) =>
    /** @type {IDBObjectStore | {putMany: function(items:?[]):Promise<?[]>}} */
    proxies[dbName] || (
      proxies[dbName] = new Proxy({dbName}, proxyHandler)
    );
  const getStoreName = dbName =>
    dbName === DB
      ? 'styles'
      : 'data';
  return {
    styles: getProxy(),
    open: getProxy,
  };

  async function tryUsingIndexedDB() {
    // we use chrome.storage.local fallback if IndexedDB doesn't save data,
    // which, once detected on the first run, is remembered in chrome.storage.local
    // note that accessing indexedDB may throw, https://github.com/openstyles/stylus/issues/615
    if (typeof indexedDB === 'undefined') {
      throw new Error('indexedDB is undefined');
    }
    switch (await chromeLocal.getValue(FALLBACK)) {
      case true: throw null;
      case false: break;
      default: await testDB();
    }
    chromeLocal.setValue(FALLBACK, false);
    return dbExecIndexedDB;
  }

  async function testDB() {
    const id = `${performance.now()}.${Math.random()}.${Date.now()}`;
    await dbExecIndexedDB(DB, 'put', {id});
    const e = await dbExecIndexedDB(DB, 'get', id);
    await dbExecIndexedDB(DB, 'delete', e.id); // throws if `e` or id is null
  }

  async function useChromeStorage(err) {
    chromeLocal.setValue(FALLBACK, true);
    if (err) {
      chromeLocal.setValue(FALLBACK + 'Reason', cloneError(err));
      console.warn('Failed to access indexedDB. Switched to storage API.', err);
    }
    await require(['/background/db-chrome-storage']); /* global createChromeStorageDB */
    const BASES = {};
    return (dbName, method, ...args) => (
      BASES[dbName] || (
        BASES[dbName] = createChromeStorageDB(dbName !== DB && `${dbName}-`)
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
      request.onupgradeneeded = create;
    });
  }

  function create(event) {
    if (event.oldVersion === 0) {
      const idb = event.target.result;
      idb.createObjectStore(getStoreName(idb.name), {
        keyPath: 'id',
        autoIncrement: true,
      });
    }
  }
})();
