/* global addAPI bgReady */// common.js
/* global chromeSync */// storage-util.js
/* global debounce deepCopy deepEqual */ // toolbox.js
/* global prefs */
'use strict';

(() => {
  const nondefaults = {};
  const {__defaults, STORAGE_KEY, set} = prefs;
  const updateStorage = () => chromeSync.setValue(STORAGE_KEY, nondefaults);

  addAPI(/** @namespace API */{
    prefs: {
      /** @returns {Object} only the non-default preferences.
       * WARNING for bg context: properties of object type are direct references into `values`!
       * In non-bg contexts this is correctly deep-copied by msg.js::API. */
      get: () => nondefaults,
      set: prefs.set = (key, val, ...rest) => {
        if (set(key, val, ...rest)) {
          const def = __defaults[key];
          if (val !== def && !(val && typeof def === 'object' && deepEqual(val, def))) {
            nondefaults[key] = val;
          } else if (key in nondefaults) {
            delete nondefaults[key];
          } else {
            return;
          }
          debounce(updateStorage);
          return true;
        }
      },
    },
  });

  chromeSync.getValue(STORAGE_KEY).then(orig => {
    const copy = orig && typeof orig === 'object' ? deepCopy(orig) : {};
    prefs.ready.set(copy, {});
    if (!deepEqual(orig, nondefaults)) bgReady.all.then(updateStorage);
  });
})();
