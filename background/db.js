/* global tryCatch chromeLocal ignoreChromeError */
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
    // we use chrome.storage.local fallback if IndexedDB doesn't save data,
    // which, once detected on the first run, is remembered in chrome.storage.local
    // for reliablility and in localStorage for fast synchronous access
    // (FF may block localStorage depending on its privacy options)

    // test localStorage
    const fallbackSet = localStorage.dbInChromeStorage;
    if (fallbackSet === 'true' || !tryCatch(() => indexedDB)) {
      useChromeStorage();
      return Promise.resolve();
    }
    if (fallbackSet === 'false') {
      useIndexedDB();
      return Promise.resolve();
    }
    // test storage.local
    return chromeLocal.get('dbInChromeStorage')
      .then(data =>
        data && data.dbInChromeStorage && Promise.reject())
      .then(() =>
        tryCatch(dbExecIndexedDB, 'getAllKeys', IDBKeyRange.lowerBound(1), 1) ||
        Promise.reject())
      .then(({target}) => (
        (target.result || [])[0] ?
          Promise.reject('ok') :
          dbExecIndexedDB('put', {id: -1})))
      .then(() =>
        dbExecIndexedDB('get', -1))
      .then(({target}) => (
        (target.result || {}).id === -1 ?
          dbExecIndexedDB('delete', -1) :
          Promise.reject()))
      .then(() =>
        Promise.reject('ok'))
      .catch(result => {
        if (result === 'ok') {
          useIndexedDB();
        } else {
          useChromeStorage();
        }
      });
  }

  function useChromeStorage() {
    exec = dbExecChromeStorage;
    chromeLocal.set({dbInChromeStorage: true}, ignoreChromeError);
    localStorage.dbInChromeStorage = 'true';
  }

  function useIndexedDB() {
    exec = dbExecIndexedDB;
    chromeLocal.set({dbInChromeStorage: false}, ignoreChromeError);
    localStorage.dbInChromeStorage = 'false';
  }

  function dbExecIndexedDB(method, ...args) {
    return new Promise((resolve, reject) => {
      Object.assign(indexedDB.open('stylish', 2), {
        onsuccess(event) {
          const database = event.target.result;
          if (!method) {
            resolve(database);
          } else {
            const transaction = database.transaction(['styles'], 'readwrite');
            const store = transaction.objectStore('styles');
            try {
              Object.assign(store[method](...args), {
                onsuccess: event => resolve(event, store, transaction, database),
                onerror: reject,
              });
            } catch (err) {
              reject(err);
            }
          }
        },
        onerror(event) {
          console.warn(event.target.error || event.target.errorCode);
          reject(event);
        },
        onupgradeneeded(event) {
          if (event.oldVersion === 0) {
            event.target.result.createObjectStore('styles', {
              keyPath: 'id',
              autoIncrement: true,
            });
          }
        },
      });
    });
  }

  function dbExecChromeStorage(method, data) {
    const STYLE_KEY_PREFIX = 'style-';
    switch (method) {
      case 'get':
        return chromeLocal.getValue(STYLE_KEY_PREFIX + data)
          .then(result => ({target: {result}}));

      case 'put':
        if (!data.id) {
          return getAllStyles().then(styles => {
            data.id = 1;
            for (const style of styles) {
              data.id = Math.max(data.id, style.id + 1);
            }
            return dbExecChromeStorage('put', data);
          });
        }
        return chromeLocal.setValue(STYLE_KEY_PREFIX + data.id, data)
          .then(() => (chrome.runtime.lastError ? Promise.reject() : data.id));

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
  }
})();
