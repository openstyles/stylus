import {kTabOvr} from '@/js/consts';
import {dataMap} from './util';

const MAX = 1000;
/** @type {Map<string,MatchCache.Entry>} keyed on URL */
export const data = new Map();

/** @param {MatchCache.Entry} val
 * @return {void} */
export function add(val) {
  data.delete(val.url); // moving to the end so the oldest entries at the beginning can be pruned
  data.set(val.url, val);
  if (data.size >= MAX) prune();
}

export function clear() {
  data.forEach(onDeleted);
  data.clear();
}

function onDeleted(val) {
  for (const sec of Object.values(val.sections)) {
    if (sec[kTabOvr] == null)
      dataMap.get(sec.id)?.urls.delete(val.url);
  }
}

export function updateSections(id, removed) {
  for (const entry of data.values()) {
    if (!removed) {
      (entry.maybe ??= new Set()).add(id);
    } else if (entry.sections[id]) {
      delete entry.sections[id];
    }
  }
}

/** @return {void} */
function prune() {
  let num = data.size / 10;
  for (const val of data.values()) {
    data.delete(val.url);
    onDeleted(val);
    if (--num <= 0)
      break;
  }
}
