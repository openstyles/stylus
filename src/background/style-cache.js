import {db as styleDB, getDbProxy} from './db';

let onDeleted;
let timer;
const MAX = 1000;
const cacheDB = getDbProxy('cache', {id: 'url'});
const cache = new Map();
const toWrite = new Set();

/** @type {typeof Map.prototype.values} */
export const values = cache.values.bind(cache);

export const get = url => (url = cache.get(url)) && hit(url);

export function add(val) {
  cache.set(val.url, hit(val));
  if (cache.size >= MAX) prune();
}

export function clear() {
  cache.clear();
  cacheDB.clear();
  if (timer) timer = clearTimeout(timer);
}

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

export async function loadAll() {
  for (const val of await cacheDB.getAll()) {
    if (!cache.has(val.url)) {
      cache.set(val.url, val);
    }
  }
}

/** @param {Map<number,StyleMapData>} dataMap */
export function hydrate(dataMap) {
  const toDel = [];
  for (const val of values()) {
    for (const id in ensureSections(val)) {
      const data = dataMap.get(+id);
      if (!data || !make(val, data.style)) {
        toDel.push(val);
        break;
      }
    }
  }
  if (toDel[0]) del(toDel);
}

export function ensureSections(entry) {
  entry.maybeMatch ??= new Set();
  return (entry.sections ??= {});
}

export function make(entry, style, idx, code) {
  const id = style.id;
  const entrySections = entry.sections;
  if (idx || !(idx = entrySections[id]).idx) {
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
  return true;
}

export function setOnDeleted(fn) {
  onDeleted = fn;
}

function del(items) {
  cacheDB.deleteMany(items);
  for (const val of items) {
    cache.delete(val.url);
    onDeleted(val);
  }
}

/** @param {Set} items */
function flush() {
  const bare = [];
  for (const {d, url, maybeMatch, sections} of toWrite) {
    const indexes = {};
    const res = {};
    let styleId;
    for (styleId in sections) indexes[styleId] = sections[styleId].idx;
    // Adding the meaningful props first to ensure their visibility in devtools DB viewer
    if (styleId) res.sections = indexes;
    if (maybeMatch.size) res.maybeMatch = maybeMatch;
    res.d = [d?.[1] || 0, new Date()];
    res.url = url;
    bare.push(res);
  }
  cacheDB.putMany(bare);
  toWrite.clear();
  timer = null;
}

function hit(val) {
  if (val) {
    toWrite.add(val);
    timer ??= setTimeout(flush);
  }
  return val;
}

function prune() {
  del([...values()]
    .filter(val => val.d)
    .sort(({d: [a1, a2]}, {d: [b1, b2]}) =>
      100 * (a1 - b1) +
      10 * ((b2 - b1) - (a2 - a1)) +
      a2 - b2)
    .slice(0, MAX * .25));
}
