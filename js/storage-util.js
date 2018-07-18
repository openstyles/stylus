/* global loadScript */
'use strict';

// eslint-disable-next-line no-var
var [chromeLocal, chromeSync] = (() => {
  const native = 'sync' in chrome.storage &&
                 !chrome.runtime.id.includes('@temporary');
  if (!native && BG !== window) {
    setupOnChangeRelay();
  }
  return [
    createWrapper('local'),
    createWrapper('sync'),
  ];

  function createWrapper(name) {
    if (!native) createDummyStorage(name);
    const storage = chrome.storage[name];
    const wrapper = {
      get: data => new Promise(resolve => storage.get(data, resolve)),
      set: data => new Promise(resolve => storage.set(data, () => resolve(data))),
      remove: data => new Promise(resolve => storage.remove(data, resolve)),

      /**
       * @param {String} key
       * @param {Any}    [defaultValue]
       * @returns {Promise<any>}
       */
      getValue: (key, defaultValue) =>
        wrapper.get(
          defaultValue !== undefined ?
            {[key]: defaultValue} :
            key
        ).then(data => data[key]),

      setValue: (key, value) => wrapper.set({[key]: value}),

      getLZValue: key => wrapper.getLZValues([key]).then(data => data[key]),
      getLZValues: keys =>
        Promise.all([
          wrapper.get(keys),
          loadLZStringScript(),
        ]).then(([data = {}, LZString]) => {
          for (const key of keys) {
            const value = data[key];
            data[key] = value && tryJSONparse(LZString.decompressFromUTF16(value));
          }
          return data;
        }),
      setLZValue: (key, value) =>
        loadLZStringScript().then(LZString =>
          wrapper.set({
            [key]: LZString.compressToUTF16(JSON.stringify(value)),
          })),

      loadLZStringScript,
    };
    return wrapper;
  }

  function createDummyStorage(name) {
    chrome.storage[name] = {
      get: (data, cb) => API.dummyStorageGet({data, name}).then(cb),
      set: (data, cb) => API.dummyStorageSet({data, name}).then(cb),
      remove: (data, cb) => API.dummyStorageRemove({data, name}).then(cb),
    };
  }

  function loadLZStringScript() {
    return window.LZString ?
      Promise.resolve(window.LZString) :
      loadScript('/vendor/lz-string-unsafe/lz-string-unsafe.min.js').then(() =>
        (window.LZString = window.LZString || window.LZStringUnsafe));
  }

  function setupOnChangeRelay() {
    const listeners = new Set();
    const onMessage = msg => {
      if (!msg.dummyStorageChanges) return;
      for (const fn of listeners.values()) {
        fn(msg.dummyStorageChanges, msg.dummyStorageName);
      }
    };
    Object.assign(chrome.storage.onChanged, {
      addListener(fn) {
        if (!listeners.size) chrome.runtime.onMessage.addListener(onMessage);
        listeners.add(fn);
      },
      hasListener: fn => listeners.has(fn),
      removeListener(fn) {
        listeners.delete(fn);
        if (!listeners.size) chrome.runtime.onMessage.removeListener(onMessage);
      }
    });
  }
})();
