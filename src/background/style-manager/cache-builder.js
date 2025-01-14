import {styleCodeEmpty} from '@/js/sections-util';
import cacheData, * as styleCache from './cache';
import {urlMatchSection, urlMatchStyle} from './matcher';
import {dataMap} from './util';

/** @param {StyleObj} style
 * @return {void} */
export function buildCacheForStyle(style) {
  const {id} = style;
  const data = dataMap.get(id);
  // FIXME: ideally, when preview is available, there is no need to rebuild the cache when original style change.
  // we should lift this logic to parent function.
  const styleToApply = data.preview || style;
  const updated = new Set();
  for (const cache of cacheData.values()) {
    const url = cache.url;
    if (!data.appliesTo.has(url)) {
      (cache.maybeMatch ??= new Set()).add(id);
      continue;
    }
    const code = getAppliedCode({url}, styleToApply);
    if (code) {
      updated.add(url);
      buildCacheEntry(cache, styleToApply, code);
    } else if (cache.sections[id]) {
      delete cache.sections[id];
    } else {
      continue;
    }
    styleCache.hit(cache);
  }
  data.appliesTo = updated;
}

/**
 * @param {MatchCache.Entry} cache
 * @param {string} url
 * @param {Iterable<number>} [ids]
 * @return {void} */
export function buildCache(cache, url, ids) {
  const query = {url};
  for (let data of ids || dataMap.values()) {
    if (ids && !(data = dataMap.get(data)))
      continue;
    const {style} = data;
    // getSectionsByUrl only needs enabled styles
    const code = style.enabled && getAppliedCode(query, data.preview || style);
    if (code) {
      buildCacheEntry(cache, style, code);
      data.appliesTo.add(url);
    }
  }
}

/**
 * @param {MatchCache.Entry} entry
 * @param {StyleObj} style
 * @param {MatchCache.Index} [idx]
 * @param {string[]} [code]
 */
function buildCacheEntry(entry, style, [idx, code]) {
  styleCache.make(entry, style, idx, code);
}

/** Get styles matching a URL, including sloppy regexps and excluded items.
 * @param {MatchQuery} query
 * @param {StyleObj} style
 * @return {?Array}
 */
function getAppliedCode(query, style) {
  const result = urlMatchStyle(query, style);
  const isIncluded = result === 'included';
  const code = [];
  const idx = [];
  if (!isIncluded && result !== true) {
    return;
  }
  let i = 0;
  for (const section of style.sections) {
    if ((isIncluded || urlMatchSection(query, section) === true)
    && !styleCodeEmpty(section)) {
      code.push(section.code);
      idx.push(i);
    }
    i++;
  }
  return code.length && [idx, code];
}
