import {kExclusions, kInclusions, kOverridden} from '@/js/consts';
import {styleCodeEmpty} from '@/js/sections-util';
import {themeAllowsStyle} from '../color-scheme';
import cacheData, * as styleCache from './cache';
import {urlMatchOverride, urlMatchSection} from './matcher';
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
    if (styleToApply.enabled && getAppliedCode({url}, styleToApply, cache)) {
      updated.add(url);
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
    if (style.enabled && getAppliedCode(query, data.preview || style, cache, style))
      data.appliesTo.add(url);
  }
}

/** Checks an __enabled__ style against url, theme, overrides, then caches the result.
 * @param {MatchQuery} query
 * @param {StyleObj} style
 * @param {MatchCache.Entry} cache
 * @param {StyleObj} [styleToCache]
 * @return {true | void}
 */
function getAppliedCode(query, style, cache, styleToCache = style) {
  let v;
  /** Make sure to use the same logic in getAppliedCode and getByUrl */
  const result = // skipping checks performed by the caller as a trivial optimization
    // style.enabled &&
    themeAllowsStyle(style) &&
    (!(v = style[kExclusions]) || !v.length || !v.some(urlMatchOverride, query)) &&
    (!(v = style[kInclusions]) || !v.length || -v.some(urlMatchOverride, query)
      || !style[kOverridden]);
  if (!result)
    return;
  const isIncluded = result < 0;
  const code = [];
  const idx = [];
  let i = 0;
  for (const section of style.sections) {
    if ((isIncluded || urlMatchSection(query, section) === true)
    && !styleCodeEmpty(section)) {
      code.push(section.code);
      idx.push(i);
    }
    i++;
  }
  if (code.length) {
    styleCache.make(cache, styleToCache, idx, code);
    return true;
  }
}
