'use strict';

// eslint-disable-next-line no-unused-expressions
(chrome.runtime.id.includes('@temporary') || !('sync' in chrome.storage)) && (() => {

  const listeners = new Set();
  Object.assign(chrome.storage.onChanged, {
    addListener: fn => listeners.add(fn),
    hasListener: fn => listeners.has(fn),
    removeListener: fn => listeners.delete(fn),
  });

  for (const name of ['local', 'sync']) {
    const dummy = tryJSONparse(localStorage['dummyStorage.' + name]) || {};
    chrome.storage[name] = {
      get(data, cb) {
        let result = {};
        if (data === null) {
          result = deepCopy(dummy);
        } else if (Array.isArray(data)) {
          for (const key of data) {
            result[key] = dummy[key];
          }
        } else if (typeof data === 'object') {
          const hasOwnProperty = Object.prototype.hasOwnProperty;
          for (const key in data) {
            if (hasOwnProperty.call(data, key)) {
              const value = dummy[key];
              result[key] = value === undefined ? data[key] : value;
            }
          }
        } else {
          result[data] = dummy[data];
        }
        if (typeof cb === 'function') cb(result);
      },
      set(data, cb) {
        const hasOwnProperty = Object.prototype.hasOwnProperty;
        const changes = {};
        for (const key in data) {
          if (!hasOwnProperty.call(data, key)) continue;
          const newValue = data[key];
          changes[key] = {newValue, oldValue: dummy[key]};
          dummy[key] = newValue;
        }
        localStorage['dummyStorage.' + name] = JSON.stringify(dummy);
        if (typeof cb === 'function') cb();
        notify(changes);
      },
      remove(keyOrKeys, cb) {
        const changes = {};
        for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) {
          changes[key] = {oldValue: dummy[key]};
          delete dummy[key];
        }
        localStorage['dummyStorage.' + name] = JSON.stringify(dummy);
        if (typeof cb === 'function') cb();
        notify(changes);
      },
    };
  }

  window.API_METHODS = Object.assign(window.API_METHODS || {}, {
    dummyStorageGet: ({data, name}) => new Promise(resolve => chrome.storage[name].get(data, resolve)),
    dummyStorageSet: ({data, name}) => new Promise(resolve => chrome.storage[name].set(data, resolve)),
    dummyStorageRemove: ({data, name}) => new Promise(resolve => chrome.storage[name].remove(data, resolve)),
  });

  function notify(changes, name) {
    for (const fn of listeners.values()) {
      fn(changes, name);
    }
    sendMessage({
      dummyStorageChanges: changes,
      dummyStorageName: name,
    }, ignoreChromeError);
  }
})();
