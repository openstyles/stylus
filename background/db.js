/* global chromeLocal workerUtil createChromeStorageDB */
/* exported db */
/*
Initialize a database. There are some problems using IndexedDB in Firefox:
https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/

Some of them are fixed in FF59:
https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/
'use strict';

const db = (() => {
  const DATABASE = 'stylish';
  const STORE = 'styles';
  const FALLBACK = 'dbInChromeStorage';
  const dbApi = {
    async exec(...args) {
      dbApi.exec = await tryUsingIndexedDB().catch(useChromeStorage);
      return dbApi.exec(...args);
    },
  };
  return dbApi;

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
    return useIndexedDB();
  }

  async function testDB() {
    let e = await dbExecIndexedDB('getAllKeys', IDBKeyRange.lowerBound(1), 1);
    // throws if result is null
    e = e.target.result[0];
    const id = `${performance.now()}.${Math.random()}.${Date.now()}`;
    await dbExecIndexedDB('put', {id});
    e = await dbExecIndexedDB('get', id);
    // throws if result or id is null
    await dbExecIndexedDB('delete', e.target.result.id);
  }

  function useChromeStorage(err) {
    chromeLocal.setValue(FALLBACK, true);
    if (err) {
      chromeLocal.setValue(FALLBACK + 'Reason', workerUtil.cloneError(err));
      console.warn('Failed to access indexedDB. Switched to storage API.', err);
    }
    return createChromeStorageDB().exec;
  }

  function useIndexedDB() {
    chromeLocal.setValue(FALLBACK, false);
    return dbExecIndexedDB;
  }

  async function dbExecIndexedDB(method, ...args) {
    const mode = method.startsWith('get') ? 'readonly' : 'readwrite';
    const store = (await open()).transaction([STORE], mode).objectStore(STORE);
    const fn = method === 'putMany' ? putMany : storeRequest;
    return fn(store, method, ...args);
  }

  function storeRequest(store, method, ...args) {
    return new Promise((resolve, reject) => {
      const request = store[method](...args);
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }

  function putMany(store, _method, items) {
    return Promise.all(items.map(item => storeRequest(store, 'put', item)));
  }

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
      request.onupgradeneeded = create;
    });
  }

  function create(event) {
    if (event.oldVersion === 0) {
      event.target.result.createObjectStore(STORE, {
        keyPath: 'id',
        autoIncrement: true,
      });
    }
  }
})();
