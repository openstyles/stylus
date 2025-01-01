import * as chromeSync from '@/js/chrome-sync';
import * as prefs from '@/js/prefs';
import {debounce, deepEqual, deepMerge, isObject} from '@/js/util';
import {bgBusy, bgPreInit} from './common';

const nondefaults = {};
const origSet = prefs.set;
const updateStorage = () => chromeSync.setValue(prefs.STORAGE_KEY, nondefaults);

export default {
  /** @returns {Object} only the non-default preferences.
   * WARNING for bg context: properties of object type are direct references into `values`!
   * In non-bg contexts this is correctly deep-copied by msg.js::API. */
  get: () => nondefaults,
  set: prefs.__newSet((key, val, ...rest) => {
    if (origSet(key, val, ...rest)) {
      const def = prefs.__defaults[key];
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
  }),
  upload(data) {
    for (const k in data) prefs.set(k, data[k]);
  },
};

bgPreInit.push(chromeSync.getValue(prefs.STORAGE_KEY).then(orig => {
  prefs.ready.set(isObject(orig) ? deepMerge(orig) : {}, {});
  if (!deepEqual(orig, nondefaults)) bgBusy.then(updateStorage);
  return prefs.ready;
}));
