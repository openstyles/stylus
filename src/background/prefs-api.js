import * as chromeSync from '@/js/chrome-sync';
import * as prefs from '@/js/prefs';
import {debounce, deepEqual, deepMerge, isObject} from '@/js/util';
import {bgBusy, bgPreInit} from './common';

/** Only the non-default preferences.
 * WARNING for bg context: properties of object type are direct references into `values`!
 * In non-bg contexts this is correctly deep-copied by msg.js::API. */
export const nondefaults = {};
export const setPrefs = data => {
  for (const k in data)
    prefs.set(k, data[k]);
};

const updateStorage = () => chromeSync.set({[prefs.STORAGE_KEY]: nondefaults});

prefs.set._bgSet = (key, val) => {
  const def = prefs.__defaults[key];
  if (val !== def && !(val && typeof def === 'object' && deepEqual(val, def))) {
    nondefaults[key] = val;
  } else if (key in nondefaults) {
    delete nondefaults[key];
  } else {
    return;
  }
  if (!bgBusy) debounce(updateStorage);
  return true;
};

bgPreInit.push(chromeSync.get(prefs.STORAGE_KEY).then(orig => {
  orig = orig[prefs.STORAGE_KEY];
  __.DEBUGLOG('prefsApi', orig);
  prefs.ready.set(isObject(orig) ? deepMerge(orig) : {}, {});
  if (!deepEqual(orig, nondefaults)) bgBusy.then(updateStorage);
  return prefs.ready;
}));
