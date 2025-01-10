import {styleCodeEmpty} from '@/js/sections-util';
import cacheData, * as styleCache from './cache';
import {urlMatchSection, urlMatchStyle} from './matcher';
import {id2data} from './util';

/** @param {StyleObj} style
 * @return {void} */
export function buildCacheForStyle(style) {
  const {id} = style;
  const data = id2data(id);
  // FIXME: ideally, when preview is available, there is no need to rebuild the cache when original style change.
  // we should lift this logic to parent function.
  const styleToApply = data.preview || style;
  const excluded = new Set();
  const updated = new Set();
  for (const cache of cacheData.values()) {
    styleCache.add(cache); // write the updated value to db
    const url = cache.url;
    if (!data.appliesTo.has(url)) {
      cache.maybeMatch.add(id);
      continue;
    }
    const code = getAppliedCode({url}, styleToApply);
    if (code) {
      updated.add(url);
      buildCacheEntry(cache, styleToApply, code);
    } else {
      excluded.add(url);
      delete cache.sections[id];
    }
  }
  data.appliesTo = updated;
}

/**
 * @param {MatchCache.Entry} cache
 * @param {string} url
 * @param {Iterable<StyleDataMapEntry>} dataList
 * @return {void} */
export function buildCache(cache, url, dataList) {
  const query = {url};
  for (const data of dataList) {
    const {style} = data;
    // getSectionsByUrl only needs enabled styles
    const code = style.enabled && getAppliedCode(query, data.preview || style);
    if (code) {
      buildCacheEntry(cache, style, code);
      data.appliesTo.add(url);
    }
  }
  styleCache.add(cache);
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
