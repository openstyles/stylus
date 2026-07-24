import * as chromeSync from '@/js/chrome-sync';
import {pEditorLinter, pEditorLinterOn, STORAGE_KEY} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {debounce, deepEqual, deepMerge, isObject} from '@/js/util';
import {bgBusy, bgPreInit} from './common';

/** Only the non-default preferences.
 * WARNING for bg context: properties of object type are direct references into `values`!
 * In non-bg contexts this is correctly deep-copied by msg.js::API. */
export const nondefaults = {};
const updateStorage = () => chromeSync.set({[STORAGE_KEY]: nondefaults});

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

bgPreInit.push(chromeSync.get(STORAGE_KEY).then(orig => {
  orig = orig[STORAGE_KEY];
  if (!orig || !isObject(orig))
    orig = {};
  __.DEBUGLOG('prefsApi', {...orig});
  if (orig[pEditorLinter] === '') {
    delete orig[pEditorLinter];
    orig[pEditorLinterOn] = false;
  }
  prefs.ready.set(deepMerge(orig), {});
  if (!deepEqual(orig, nondefaults)) bgBusy.then(updateStorage);
  return prefs.ready;
}));
