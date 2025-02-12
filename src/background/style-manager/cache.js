import {bgBusy} from '../common';

let onDeleted;
let timer;
const MAX = 1000;
/** @type {Map<string,MatchCache.Entry>} keyed on URL */
const cache = new Map();
/** @type {Set<MatchCache.Entry | MatchCache.DbEntry>} */
const toWrite = new Set();

export default cache;

/** @param {MatchCache.Entry} val
 * @return {void} */
export function add(val) {
  cache.set(val.url, hit(val));
  if (cache.size >= MAX) prune();
}

/** @return {void} */
export function clear() {
  if (onDeleted) cache.forEach(onDeleted);
  if (timer) timer = clearTimeout(timer);
  cache.clear();
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
}

/** @return {void} */
function flush() {
  for (const val of toWrite)
    val.d = [val.d?.[1] || 0, new Date()];
  toWrite.clear();
  timer = null;
}

/** @return {Promise<void>} */
async function flushLater() {
  timer = setTimeout(flush, bgBusy
    ? (await bgBusy, 5000) // to let the browser settle down on startup
    : 50);
}

/** @template {MatchCache.Entry} T
 * @param {T} val
 * @return {T} */
export function hit(val) {
  if (val) {
    toWrite.add(val);
    if (!timer) flushLater();
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
