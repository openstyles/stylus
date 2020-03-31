/* global chromeLocal ignoreChromeError workerUtil createChromeStorageDB */
/* exported db */
/*
Initialize a database. There are some problems using IndexedDB in Firefox:
https://www.reddit.com/r/firefox/comments/74wttb/note_to_firefox_webextension_developers_who_use/

Some of them are fixed in FF59:
https://www.reddit.com/r/firefox/comments/7ijuaq/firefox_59_webextensions_can_use_indexeddb_when/
*/
'use strict';

const db = (() => {
  let exec;
  const preparing = prepare();
  return {
    exec: (...args) =>
      preparing.then(() => exec(...args))
  };

  function prepare() {
    return withPromise(shouldUseIndexedDB).then(
      ok => {
        if (ok) {
          useIndexedDB();
        } else {
          useChromeStorage();
        }
      },
      err => {
        useChromeStorage(err);
      }
    );
  }

  function shouldUseIndexedDB() {
    // we use chrome.storage.local fallback if IndexedDB doesn't save data,
    // which, once detected on the first run, is remembered in chrome.storage.local
    // for reliablility and in localStorage for fast synchronous access
    // (FF may block localStorage depending on its privacy options)
    // note that it may throw when accessing the variable
    // https://github.com/openstyles/stylus/issues/615
    if (typeof indexedDB === 'undefined') {
      throw new Error('indexedDB is undefined');
    }
    // test localStorage
    const fallbackSet = localStorage.dbInChromeStorage;
    if (fallbackSet === 'true') {
      return false;
    }
    if (fallbackSet === 'false') {
      return true;
    }
    // test storage.local
    return chromeLocal.get('dbInChromeStorage')
      .then(data => {
        if (data && data.dbInChromeStorage) {
          return false;
        }
        return testDBSize()
          .then(ok => ok || testDBMutation());
      });
  }

  function withPromise(fn) {
    try {
      return Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function testDBSize() {
    return dbExecIndexedDB('getAllKeys', IDBKeyRange.lowerBound(1), 1)
      .then(event => (
        event.target.result &&
        event.target.result.length &&
        event.target.result[0]
      ));
  }

  function testDBMutation() {
    return dbExecIndexedDB('put', {id: -1})
      .then(() => dbExecIndexedDB('get', -1))
      .then(event => {
        if (!event.target.result) {
          throw new Error('failed to get previously put item');
        }
        if (event.target.result.id !== -1) {
          throw new Error('item id is wrong');
        }
        return dbExecIndexedDB('delete', -1);
      })
      .then(() => true);
  }

  function useChromeStorage(err) {
    exec = createChromeStorageDB().exec;
    chromeLocal.set({dbInChromeStorage: true}, ignoreChromeError);
    if (err) {
      chromeLocal.setValue('dbInChromeStorageReason', workerUtil.cloneError(err));
      console.warn('Failed to access indexedDB. Switched to storage API.', err);
    }
    localStorage.dbInChromeStorage = 'true';
  }

  function useIndexedDB() {
    exec = dbExecIndexedDB;
    chromeLocal.set({dbInChromeStorage: false}, ignoreChromeError);
    localStorage.dbInChromeStorage = 'false';
  }

  function dbExecIndexedDB(method, ...args) {
    return open().then(database => {
      if (!method) {
        return database;
      }
      if (method === 'putMany') {
        return putMany(database, ...args);
      }
      const mode = method.startsWith('get') ? 'readonly' : 'readwrite';
      const transaction = database.transaction(['styles'], mode);
      const store = transaction.objectStore('styles');
      return storeRequest(store, method, ...args);
    });

    function storeRequest(store, method, ...args) {
      return new Promise((resolve, reject) => {
        const request = store[method](...args);
        request.onsuccess = resolve;
        request.onerror = reject;
      });
    }

    function open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('stylish', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = reject;
        request.onupgradeneeded = event => {
          if (event.oldVersion === 0) {
            event.target.result.createObjectStore('styles', {
              keyPath: 'id',
              autoIncrement: true,
            });
          }
        };
      });
    }

    function putMany(database, items) {
      const transaction = database.transaction(['styles'], 'readwrite');
      const store = transaction.objectStore('styles');
      return Promise.all(items.map(item => storeRequest(store, 'put', item)));
    }
  }
})();
