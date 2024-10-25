import * as chromeSync from '/js/chrome-sync';
import * as prefs from '/js/prefs';
import {debounce, deepCopy, deepEqual, isObject} from '/js/util';
import {bgReady} from './common';
import {sessionData} from './session-data';

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
};

(async () => {
  let orig = chromeSync.getValue(prefs.STORAGE_KEY);
  orig = process.env.MV3
    ? (await Promise.all([orig, sessionData]))[0]
    : await orig;
  prefs.ready.set(isObject(orig) ? deepCopy(orig) : {}, {});
  if (!deepEqual(orig, nondefaults)) bgReady.then(updateStorage);
})();
