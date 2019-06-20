/* global chromeLocal ignoreChromeError workerUtil */
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
    exec = dbExecChromeStorage;
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

  function dbExecChromeStorage(method, data) {
    const STYLE_KEY_PREFIX = 'style-';
    switch (method) {
      case 'get':
        return chromeLocal.getValue(STYLE_KEY_PREFIX + data)
          .then(result => ({target: {result}}));

      case 'put':
        if (!data.id) {
          return getMaxId().then(id => {
            data.id = id + 1;
            return dbExecChromeStorage('put', data);
          });
        }
        return chromeLocal.setValue(STYLE_KEY_PREFIX + data.id, data)
          .then(() => (chrome.runtime.lastError ? Promise.reject() : data.id));

      case 'putMany': {
        const newItems = data.filter(i => !i.id);
        const doPut = () =>
          chromeLocal.set(data.reduce((o, item) => {
            o[STYLE_KEY_PREFIX + item.id] = item;
            return o;
          }, {}))
            .then(() => data.map(d => ({target: {result: d.id}})));
        if (newItems.length) {
          return getMaxId().then(id => {
            for (const item of newItems) {
              item.id = ++id;
            }
            return doPut();
          });
        }
        return doPut();
      }

      case 'delete':
        return chromeLocal.remove(STYLE_KEY_PREFIX + data);

      case 'getAll':
        return getAllStyles()
          .then(styles => ({target: {result: styles}}));
    }
    return Promise.reject();

    function getAllStyles() {
      return chromeLocal.get(null).then(storage => {
        const styles = [];
        for (const key in storage) {
          if (key.startsWith(STYLE_KEY_PREFIX) &&
              Number(key.substr(STYLE_KEY_PREFIX.length))) {
            styles.push(storage[key]);
          }
        }
        return styles;
      });
    }

    function getMaxId() {
      return getAllStyles().then(styles => {
        let result = 0;
        for (const style of styles) {
          if (style.id > result) {
            result = style.id;
          }
        }
        return result;
      });
    }
  }
})();
