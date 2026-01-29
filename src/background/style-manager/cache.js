import {kExclusions, kInclusions, kOverridden, kTabOvr} from '@/js/consts';
import {styleCodeEmpty} from '@/js/sections-util';
import {themeAllowsStyle} from '../color-scheme';
import {urlMatchOverride, urlMatchSection} from './matcher';
import {dataMap} from './util';

const MAX = 1000;
/** @type {Map<string,Injection.Cache>} */
export const entries = new Map();

export function add(url, val) {
  entries.delete(url); // moving to the end so the oldest entries at the beginning can be pruned
  entries.set(url, val);
  if (entries.size >= MAX) prune();
}

/**
 * @param {string} url
 * @param {Injection.Cache} cache
 * @param {Injection.Cache['maybe']} [maybe]
 * @param {TabCacheEntry['tabOvr']} [tabOvr]
 */
export function create(url, cache, maybe, tabOvr) {
  const query = {url};
  for (let entry of maybe || dataMap.values()) {
    if (maybe) {
      if (maybe.delete(entry) && !maybe.size)
        cache.maybe = null;
      if (!(entry = dataMap.get(entry)))
        continue;
    }
    let forced, isIncluded, v;
    const style = entry.preview || entry.style;
    const id = style.id;
    if (style.enabled
      && themeAllowsStyle(style)
      && (!(v = style[kExclusions]) || !v.length || !v.some(urlMatchOverride, query))
      && (!(v = style[kInclusions]) || !v.length || (isIncluded = v.some(urlMatchOverride, query))
        || !style[kOverridden])
      || (forced = tabOvr?.[id])
    ) {
      v = [];
      for (const section of style.sections) {
        if ((isIncluded || urlMatchSection(query, section) === true) && !styleCodeEmpty(section)) {
          v.push(section.code);
        }
      }
      if (v.length) {
        cache.set(id, {
          id,
          code: v,
          name: style.customName || style.name,
          [kTabOvr]: forced,
        });
      }
    } else {
      cache.delete(id);
    }
  }
}

export function updateSections(id, removed) {
  for (const entry of entries.values()) {
    if (!removed) {
      (entry.maybe ??= new Set()).add(id);
    } else {
      entry.delete(id);
    }
  }
}

/** @return {void} */
function prune() {
  let num = entries.size / 10;
  for (const url of entries.keys()) {
    entries.delete(url);
    if (--num <= 0)
      break;
  }
}
