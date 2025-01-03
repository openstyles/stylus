import {bgBusy} from '../common';
import {db as styleDB, getDbProxy} from '../db';

let onDeleted;
let timer;
const MAX = 1000;
const cacheDB = getDbProxy('cache', {id: 'url'});
/** @type {Map<string,MatchCache.Entry>} keyed on URL */
const cache = new Map();
/** @type {Set<MatchCache.Entry | MatchCache.DbEntry>} */
const toWrite = new Set();

export default cache;

/** @param {string} url
 * @return {?MatchCache.Entry} */
export const get = url => (url = cache.get(url)) && hit(url);

/** @param {MatchCache.Entry} val
 * @return {void} */
export function add(val) {
  cache.set(val.url, hit(val));
  if (cache.size >= MAX) prune();
}

/** @return {void} */
export function clear() {
  if (onDeleted) cache.forEach(onDeleted);
  cache.clear();
  cacheDB.clear();
  if (timer) timer = clearTimeout(timer);
}

/** @param {string} url
 * @return {Promise<?MatchCache.Entry>} */
export async function loadOne(url) {
  const val = await cacheDB.get(url);
  if (val) {
    cache.set(url, hit(val));
    const styleIds = Object.keys(ensureSections(val)).map(Number);
    const styles = styleIds.length ? await styleDB.getMany(styleIds) : [];
    for (const style of styles) {
      if (!style || !make(val, style)) {
        del([val]);
        return;
      }
    }
  }
  return val;
}

/** @return {Promise<void>} */
export async function loadAll() {
  for (const val of await cacheDB.getAll()) {
    if (!cache.has(val.url)) {
      cache.set(val.url, val);
    }
  }
}

/** @param {StyleDataMap} dataMap
 * @return {void} */
export function hydrate(dataMap) {
  const toDel = [];
  for (const val of cache.values()) {
    try {
      for (const id in ensureSections(val)) {
        const data = dataMap.get(+id);
        if (!data || !make(val, data.style)) {
          toDel.push(val);
          break;
        }
      }
    } catch (e) {
      toDel.push(val);
      console.error(e, val);
    }
  }
  if (toDel[0]) del(toDel);
}

/** @param {MatchCache.DbEntry}
 * @return {Object} */
export function ensureSections(entry) {
  entry.maybeMatch ??= new Set();
  return (entry.sections ??= {});
}

/**
 * @param {MatchCache.DbEntry} entry
 * @param {StyleObj} style
 * @param {MatchCache.Index} [idx]
 * @param {string[]} [code]
 * @return {?boolean}
 */
export function make(entry, style, idx, code) {
  const id = style.id;
  const entrySections = entry.sections;
  if (idx || (idx = entrySections[id]) && !idx.idx) {
    if (!code) {
      code = [];
      for (const i of idx) {
        const sec = style.sections[i];
        if (sec) code.push(sec.code);
        else return;
      }
    }
    entrySections[id] = {
      id,
      idx,
      code,
      name: style.customName || style.name,
    };
  }
  return !!idx;
}

export function setOnDeleted(fn) {
  onDeleted = fn;
}

/** @sideeffects Overwrites the array
 * @param {MatchCache.Entry}
 * @return {void} */
function del(items) {
  if (!items[0]) return;
  for (let i = 0, val; i < items.length; i++) {
    val = items[i];
    cache.delete(items[i] = val.url);
    onDeleted(val);
  }
  cacheDB.deleteMany(items);
}

/** @return {void} */
function flush() {
  const bare = [];
  let toDel;
  nextEntry:
  for (const val of toWrite) {
    const {d, url, maybeMatch, sections} = val;
    /** @type {MatchCache.IndexMap} */
    const indexes = {};
    /** @type {MatchCache.DbEntry} */
    const res = {};
    let styleId;
    for (styleId in sections) {
      /** @type {Injection.Sections | MatchCache.Index} */
      const sec = sections[styleId];
      const idx = sec && (Array.isArray(sec) ? sec : sec.idx);
      if (!idx) {
        (toDel ??= []).push(val);
        continue nextEntry;
      }
      indexes[styleId] = idx;
    }
    // Adding the meaningful props first to ensure their visibility in devtools DB viewer
    if (styleId) res.sections = indexes;
    if (maybeMatch.size) res.maybeMatch = maybeMatch;
    res.d = [d?.[1] || 0, new Date()];
    res.url = url;
    bare.push(res);
  }
  if (toDel) del(toDel);
  cacheDB.putMany(bare);
  toWrite.clear();
  timer = null;
}

/** @return {Promise<void>} */
async function flushLater() {
  const delay = bgBusy ? 5000/*to let the browser settle down on startup*/ : 1000;
  if (bgBusy) await bgBusy; // bgBusy will be null after await
  setTimeout(flush, delay);
}

/** @template {MatchCache.Entry} T
 * @param {T} val
 * @return {T} */
function hit(val) {
  if (val) {
    toWrite.add(val);
    timer ??= flushLater();
  }
  return val;
}

/** @return {void} */
function prune() {
  del([...cache.values()]
    .filter(val => val.d)
    .sort(({d: [a1, a2]}, {d: [b1, b2]}) =>
      100 * (a1 - b1) +
      10 * ((b2 - b1) - (a2 - a1)) +
      a2 - b2)
    .slice(0, 10));
}
