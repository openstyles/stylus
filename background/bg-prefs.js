/* global addAPI bgReady */// common.js
/* global chromeSync */// storage-util.js
/* global debounce deepCopy deepEqual */ // toolbox.js
/* global prefs */
'use strict';

(() => {
  let nondefaults;
  const {__defaults, STORAGE_KEY} = prefs;
  const updateStorage = () => chromeSync.setValue(STORAGE_KEY, nondefaults);

  addAPI(/** @namespace API */{
    prefs: {
      /** @returns {Object} only the non-default preferences.
       * WARNING for bg context: properties of object type are direct references into `values`!
       * In non-bg contexts this is correctly deep-copied by msg.js::API. */
      get: () => nondefaults,
      set(key, val) {
        if (prefs.set(key, val)) {
          const def = __defaults[key];
          if (val !== def && !(val && typeof def === 'object' && deepEqual(val, def))) {
            nondefaults[key] = val;
          } else if (key in nondefaults) {
            delete nondefaults[key];
          } else {
            return;
          }
          debounce(updateStorage);
        }
      },
    },
  });

  browser.storage.sync.get(STORAGE_KEY).then(async ({[STORAGE_KEY]: orig}) => {
    const copy = orig && typeof orig === 'object' ? deepCopy(orig) : {};
    prefs.ready.set(copy, {});
    nondefaults = await prefs.ready;
    if (!deepEqual(orig, nondefaults)) bgReady.all.then(updateStorage);
  });
})();
