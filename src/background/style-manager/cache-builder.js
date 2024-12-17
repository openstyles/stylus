import {id2data} from '@/background/style-manager/util';
import {styleCodeEmpty} from '@/js/sections-util';
import * as styleCache from './cache';
import {urlMatchSection, urlMatchStyle} from './matcher';

export function buildCacheForStyle(style) {
  const {id} = style;
  const data = id2data(id);
  // FIXME: ideally, when preview is available, there is no need to rebuild the cache when original style change.
  // we should lift this logic to parent function.
  const styleToApply = data.preview || style;
  const excluded = new Set();
  const updated = new Set();
  for (const cache of styleCache.values()) {
    styleCache.add(cache);
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

export function buildCache(cache, url, styleList) {
  const query = {url};
  for (const data of styleList) {
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

function buildCacheEntry(entry, style, [idx, code]) {
  styleCache.make(entry, style, idx, code);
}

/** Get styles matching a URL, including sloppy regexps and excluded items. */
function getAppliedCode(query, data) {
  const result = urlMatchStyle(query, data);
  const isIncluded = result === 'included';
  const code = [];
  const idx = [];
  if (!isIncluded && result !== true) {
    return;
  }
  let i = 0;
  for (const section of data.sections) {
    if ((isIncluded || urlMatchSection(query, section) === true)
    && !styleCodeEmpty(section)) {
      code.push(section.code);
      idx.push(i);
    }
    i++;
  }
  return code.length && [idx, code];
}
