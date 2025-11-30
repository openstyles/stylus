import {kExclusions, kInclusions, kOverridden, kTabOvr} from '@/js/consts';
import {styleCodeEmpty} from '@/js/sections-util';
import {themeAllowsStyle} from '../color-scheme';
import {urlMatchOverride, urlMatchSection} from './matcher';
import {dataMap} from './util';

/**
 * @param {MatchCache.Entry} cache
 * @param {string} url
 * @param {MatchCache.Entry['maybe']} [maybe]
 * @param {number} tabId
 * @param {TabCacheEntry['tabOvr']} [tabOverrides]
 * @return {void} */
export function buildCache(cache, url, maybe, tabId, tabOverrides) {
  const query = {url};
  for (const src of maybe || dataMap.values()) {
    const data = !maybe ? src : dataMap.get(src);
    if (data) {
      const {style} = data;
      const id = style.id;
      const ovr = tabOverrides?.[id];
      if ((ovr ?? style.enabled)
      && getAppliedCode(query, data.preview || style, cache, style, ovr)) {
        data.urls.add(url);
      } else {
        delete cache.sections[id];
        if (ovr == null) data.urls.delete(url);
      }
    }
    if (maybe?.delete(src) && !maybe.size)
      cache.maybe = null;
  }
}

/** Checks an __enabled__ style against url, theme, overrides, then caches the result.
 * @param {MatchQuery} query
 * @param {StyleObj} style
 * @param {MatchCache.Entry} [cache]
 * @param {StyleObj} [styleToCache]
 * @param {boolean} [tabOvr]
 * @return {true | void}
 */
function getAppliedCode(query, style, cache, styleToCache = style, tabOvr) {
  let v, isIncluded;
  v = tabOvr ||
  /** Make sure to use the same logic in getAppliedCode and getByUrl */
    // style.enabled is checked in the caller for optimization
    themeAllowsStyle(style) &&
    (!(v = style[kExclusions]) || !v.length || !v.some(urlMatchOverride, query)) &&
    (!(v = style[kInclusions]) || !v.length || (isIncluded = v.some(urlMatchOverride, query))
      || !style[kOverridden]);
  if (!v)
    return;
  const code = [];
  for (const section of style.sections) {
    if ((isIncluded || urlMatchSection(query, section) === true) && !styleCodeEmpty(section)) {
      code.push(section.code);
    }
  }
  if (code.length) {
    const id = styleToCache.id;
    cache.sections[id] = {
      id,
      code,
      name: styleToCache.customName || styleToCache.name,
      [kTabOvr]: tabOvr,
    };
    return true;
  }
}
