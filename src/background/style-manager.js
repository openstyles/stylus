import * as prefs from '/js/prefs';
import {calcStyleDigest, styleCodeEmpty} from '/js/sections-util';
import {
  deepEqual, isEmptyObj, mapObj, stringAsRegExpStr, tryRegExp, tryURL, UCD, URLS,
} from '/js/toolbox';
import {broadcast, broadcastExtension} from './broadcast';
import broadcastInjectorConfig from './broadcast-injector-config';
import * as colorScheme from './color-scheme';
import {API, bgReady, uuidIndex} from './common';
import db from './db';
import StyleCache from './style-cache';
import tabMan from './tab-manager';
import {getUrlOrigin} from './tab-util';

//#region Declarations

/** @type {Map<number,StyleMapData>} */
const dataMap = new Map();
/** @type {Map<string,CachedInjectedStyles>} */
const cachedStyleForUrl = StyleCache({
  onDeleted(url, {sections}) {
    for (const id in sections) {
      const data = id2data(id);
      if (data) data.appliesTo.delete(url);
    }
  },
});
const BAD_MATCHER = {test: () => false};
const compileRe = createCompiler(text => `^(${text})$`);
const compileSloppyRe = createCompiler(text => `^${text}$`);
const compileExclusion = createCompiler(buildExclusion);

const uuidv4 = crypto.randomUUID ? crypto.randomUUID.bind(crypto) : (() => {
  const seeds = crypto.getRandomValues(new Uint16Array(8));
  // 00001111-2222-M333-N444-555566667777
  seeds[3] = seeds[3] & 0x0FFF | 0x4000; // UUID version 4, M = 4
  seeds[4] = seeds[4] & 0x3FFF | 0x8000; // UUID variant 1, N = 8..0xB
  return Array.from(seeds, hex4dashed).join('');
});

const CFG_OFF = {cfg: {off: true}};
const MISSING_PROPS = {
  name: style => `ID: ${style.id}`,
  _id: () => uuidv4(),
  _rev: () => Date.now(),
};

const ON_DISCONNECT = {
  livePreview: onPreviewEnd,
  draft: onDraftEnd,
};

const INJ_ORDER = 'injectionOrder';
export const order = /** @type {InjectionOrder} */{main: {}, prio: {}};
const orderWrap = {
  id: INJ_ORDER,
  value: mapObj(order, () => []),
  _id: `${chrome.runtime.id}-${INJ_ORDER}`,
  _rev: 0,
};
/** @returns {{[type: string]: string[]}}>} */
export const getOrder = () => orderWrap.value;
uuidIndex.addCustom(orderWrap, {set: setOrderImpl});

class MatchQuery {
  constructor(url) {
    this.url = url;
  }
  get urlWithoutHash() {
    return this._set('urlWithoutHash', this.url.split('#', 1)[0]);
  }
  get urlWithoutParams() {
    return this._set('urlWithoutParams', this.url.split(/[?#]/, 1)[0]);
  }
  get domain() {
    return this._set('domain', tryURL(this.url).hostname);
  }
  get isOwnPage() {
    return this._set('isOwnPage', this.url.startsWith(URLS.ownOrigin));
  }
  _set(name, value) {
    Object.defineProperty(this, name, {value});
    return value;
  }
}

init();

chrome.runtime.onConnect.addListener(port => {
  // Using ports to reliably track when the client is closed, however not for messaging,
  // because our `API` is much faster due to direct invocation.
  const type = port.name.split(':', 1)[0];
  const fn = ON_DISCONNECT[type];
  if (fn) port.onDisconnect.addListener(fn);
});
bgReady.all.then(() => colorScheme.onChange(value => {
  broadcastExtension({method: 'colorScheme', value});
  for (const {style} of dataMap.values()) {
    if (colorScheme.SCHEMES.includes(style.preferScheme)) {
      broadcastStyleUpdated(style, 'colorScheme');
    }
  }
}, true));

//#endregion
//#region Exports

/** @returns {number} style id */
export function remove(id, reason) {
  const {style, appliesTo} = dataMap.get(id);
  const sync = reason !== 'sync';
  const uuid = style._id;
  db.styles.delete(id);
  if (sync) API.sync.remove(uuid, Date.now());
  for (const url of appliesTo) {
    const cache = cachedStyleForUrl.get(url);
    if (cache) delete cache.sections[id];
  }
  dataMap.delete(id);
  uuidIndex.delete(uuid);
  mapObj(orderWrap.value, (group, type) => {
    delete order[type][id];
    const i = group.indexOf(uuid);
    if (i >= 0) group.splice(i, 1);
  });
  setOrderImpl(orderWrap, {calc: false});
  if (style._usw && style._usw.token) {
    // Must be called after the style is deleted from dataMap
    API.usw.revoke(id);
  }
  API.drafts.delete(id).catch(() => {});
  broadcast({
    method: 'styleDeleted',
    style: {id},
  }, {onlyIfStyled: true});
  return id;
}

/** @returns {Promise<StyleObj>} */
export function editSave(style) {
  style = mergeWithMapped(style);
  style.updateDate = Date.now();
  API.drafts.delete(style.id).catch(() => {});
  return saveStyle(style, 'editSave');
}

/** @returns {StyleObj|void} */
export function find(filter, subkey) {
  for (const {style} of dataMap.values()) {
    let obj = subkey ? style[subkey] : style;
    if (!obj) continue;
    for (const key in filter) {
      if (filter[key] !== obj[key]) {
        obj = null;
        break;
      }
    }
    if (obj) return style;
  }
}

export const getAll = () => Array.from(dataMap.values(), v => v.style);

/** @returns {{[type: string]: StyleObj[]}}>} */
export function getAllOrdered(keys) {
  const res = mapObj(orderWrap.value, group => group.map(uuid2style).filter(Boolean));
  if (res.main.length + res.prio.length < dataMap.size) {
    for (const {style} of dataMap.values()) {
      if (!(style.id in order.main) && !(style.id in order.prio)) {
        res.main.push(style);
      }
    }
  }
  return keys
    ? mapObj(res, group => group.map(style => mapObj(style, null, keys)))
    : res;
}

/** @returns {string | {[remoteId:string]: styleId}}>} */
export function getRemoteInfo(id) {
  if (id) return calcRemoteId(id2style(id));
  const res = {};
  for (const {style} of dataMap.values()) {
    const [rid, vars] = calcRemoteId(style);
    if (rid) res[rid] = [style.id, vars];
  }
  return res;
}

/** @returns {Injection} */
export function getSectionsByUrl(url, id, isInitialApply) {
  const p = prefs.__values;
  if (isInitialApply && p.disableAll) {
    return CFG_OFF;
  }
  const {sender = {}} = this || {};
  const {tab = {}, frameId, TDM} = sender;
  const isTop = !frameId || TDM || sender.type === 'main_frame'; // prerendering in onBeforeRequest
  /** @type {InjectionConfig} */
  const cfg = !id && {
    ass: p.styleViaASS,
    dark: isTop && colorScheme.isDark(),
    // TODO: enable in FF when it supports sourceURL comment in style elements (also options.html)
    name: CHROME && p.exposeStyleName,
    nonce: FIREFOX && tabMan.get(tab.id, 'nonce', frameId),
    top: isInitialApply && p.exposeIframes && (
      isTop ? '' // apply.js will use location.origin
        : getUrlOrigin(tab.url || tabMan.get(sender.tabId || tab.id, 'url'))
    ),
    order,
  };
  if (isInitialApply === 'cfg') {
    return {cfg};
  }
  if (frameId === 0) {
    /* Chrome hides text frament from location.href of the page e.g. #:~:text=foo
       so we'll use the real URL reported by webNavigation API.
       TODO: if FF will do the same, this won't work as is: FF reports onCommitted too late */
    url = tabMan.get(tab.id, 'url') || url;
  }
  /** @type {CachedInjectedStyles} */
  let cache = cachedStyleForUrl.get(url);
  if (!cache) {
    cache = {
      sections: {},
      maybeMatch: new Set(),
    };
    buildCache(cache, url, dataMap.values());
    cachedStyleForUrl.set(url, cache);
  } else if (cache.maybeMatch.size) {
    buildCache(cache, url, Array.from(cache.maybeMatch, id2data).filter(Boolean));
  }
  let res = cache.sections;
  return {
    cfg,
    sections: id
      ? ((res = res[id])) ? [res] : []
      : Object.values(res),
  };
}

/** @returns {StylesByUrlResult[]} */
export function getByUrl(url, id = null) {
  // FIXME: do we want to cache this? Who would like to open popup rapidly
  // or search the DB with the same URL?
  const result = [];
  const styles = id
    ? [id2style(id)].filter(Boolean)
    : iterStyles();
  const query = new MatchQuery(url);
  for (const style of styles) {
    let empty = true;
    let excluded = false;
    let excludedScheme = false;
    let included = false;
    let sloppy = false;
    let sectionMatched = false;
    const match = urlMatchStyle(query, style);
    // TODO: enable this when the function starts returning false
    // if (match === false) {
    // continue;
    // }
    if (match === 'included') {
      included = true;
    }
    if (match === 'excluded') {
      excluded = true;
    }
    if (match === 'excludedScheme') {
      excludedScheme = true;
    }
    for (const section of style.sections) {
      const match = urlMatchSection(query, section, true);
      if (match) {
        if (match === 'sloppy') {
          sloppy = true;
        }
        sectionMatched = true;
        if (empty) empty = styleCodeEmpty(section);
      }
    }
    if (sectionMatched || included) {
      result.push(/** @namespace StylesByUrlResult */ {
        empty,
        excluded,
        excludedScheme,
        included,
        sectionMatched,
        sloppy,
        style,
      });
    }
  }
  return result;
}

/** @returns {Promise<{style?:StyleObj, err?:?}[]>} */
export async function importMany(items) {
  const res = [];
  const styles = [];
  for (const style of items) {
    try {
      beforeSave(style);
      if (style.sourceCode && style[UCD]) {
        await API.usercss.buildCode(style);
      }
      res.push(styles.push(style) - 1);
    } catch (err) {
      res.push({err});
    }
  }
  const events = await db.styles.putMany(styles);
  const messages = [];
  for (let i = 0, r; i < res.length; i++) {
    r = res[i];
    if (!r.err) {
      const id = events[r];
      const method = dataMap.has(id) ? 'styleUpdated' : 'styleAdded';
      const style = handleSave(styles[r], false, id);
      messages.push([style, 'import', method]);
      buildCacheForStyle(style);
      res[i] = {style};
    }
  }
  setTimeout(() => messages.forEach(args => broadcastStyleUpdated(...args)), 100);
  return Promise.all(res);
}

/** @returns {Promise<StyleObj>} */
export async function install(style, reason = dataMap.has(style.id) ? 'update' : 'install') {
  style = mergeWithMapped(style);
  style.originalDigest = await calcStyleDigest(style);
  // FIXME: update updateDate? what about usercss config?
  return saveStyle(style, reason);
}

/** @param {StyleObj} style */
export async function preview(style) {
  let res = style.sourceCode || false;
  if (res) {
    res = await API.usercss.build({
      styleId: style.id,
      sourceCode: res,
      assignVars: true,
    });
    delete res.style.enabled;
    Object.assign(style, res.style);
  }
  id2data(style.id).preview = style;
  broadcastStyleUpdated(style, 'editPreview');
  return res.log;
}

/** @returns {Promise<void>} */
export function setOrder(value) {
  return setOrderImpl({value}, {broadcast: true, sync: true});
}

/** @returns {Promise<StyleObj>} */
export async function toggle(id, enabled) {
  const style = Object.assign({}, id2style(id), {enabled});
  await saveStyle(style, 'toggle');
}

/** @returns {Promise<void>} */
export async function toggleOverride(id, rule, isInclusion, isAdd) {
  const style = Object.assign({}, id2style(id));
  const type = isInclusion ? 'inclusions' : 'exclusions';
  let list = style[type];
  if (isAdd) {
    if (!list) list = style[type] = [];
    else if (list.includes(rule)) throw new Error('The rule already exists');
    list.push(rule);
  } else if (list) {
    const i = list.indexOf(rule);
    if (i >= 0) list.splice(i, 1);
  } else {
    return;
  }
  cachedStyleForUrl.clear();
  await saveStyle(style, 'config');
}

/** @returns {Promise<void>} */
export async function config(id, prop, value) {
  const style = Object.assign({}, id2style(id));
  const {preview} = dataMap.get(id);
  style[prop] = (preview || {})[prop] = value;
  if (prop === 'inclusions' || prop === 'exclusions') cachedStyleForUrl.clear();
  await saveStyle(style, 'config');
}

//#endregion
//#region Implementation

/** @returns {StyleMapData|void} */
function id2data(id) {
  return dataMap.get(id);
}

/** @returns {StyleObj|void} */
export function id2style(id) {
  return (dataMap.get(Number(id)) || {}).style;
}

/** @returns {StyleObj|void} */
export function uuid2style(uuid) {
  return id2style(uuidIndex.get(uuid));
}

function calcRemoteId({md5Url, updateUrl, [UCD]: ucd} = {}) {
  let id;
  id = (id = /\d+/.test(md5Url) || URLS.extractUsoaId(updateUrl)) && `uso-${id}`
    || (id = URLS.extractUswId(updateUrl)) && `usw-${id}`
    || '';
  return id && [
    id,
    ucd && !isEmptyObj(ucd.vars),
  ];
}

/** @returns {StyleObj} */
function createNewStyle() {
  return {
    enabled: true,
    installDate: Date.now(),
  };
}

/** @returns {void} */
function storeInMap(style) {
  dataMap.set(style.id, {
    style,
    appliesTo: new Set(),
  });
  uuidIndex.set(style._id, style.id);
}

/** @returns {StyleObj} */
function mergeWithMapped(style) {
  return Object.assign({},
    id2style(style.id) || createNewStyle(),
    style);
}

function onDraftEnd(port) {
  const id = port.name.split(':')[1];
  API.drafts.delete(+id || id).catch(() => {});
}

function onPreviewEnd({name}) {
  const id = +name.split(':')[1];
  const data = id2data(id);
  if (!data) return;
  data.preview = null;
  broadcastStyleUpdated(data.style, 'editPreviewEnd');
}

function buildCacheForStyle(style) {
  const {id} = style;
  const data = id2data(id);
  // FIXME: ideally, when preview is available, there is no need to rebuild the cache when original style change.
  // we should lift this logic to parent function.
  const styleToApply = data.preview || style;
  const excluded = new Set();
  const updated = new Set();
  for (const [url, cache] of cachedStyleForUrl.entries()) {
    if (!data.appliesTo.has(url)) {
      cache.maybeMatch.add(id);
      continue;
    }
    const code = getAppliedCode(new MatchQuery(url), styleToApply);
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

function broadcastStyleUpdated(style, reason, isNew) {
  buildCacheForStyle(style);
  return broadcast({
    method: isNew ? 'styleAdded' : 'styleUpdated',
    reason,
    style: {
      id: style.id,
      enabled: style.enabled,
    },
  }, {onlyIfStyled: !style.enabled});
}

function beforeSave(style) {
  if (!style.name) {
    throw new Error('Style name is empty');
  }
  if (!style._id) {
    style._id = uuidv4();
  }
  if (!style.id) {
    delete style.id;
  }
  style._rev = Date.now();
  fixKnownProblems(style);
}

export {saveStyle as save};

/** @returns {Promise<StyleObj>} */
export async function saveStyle(style, reason) {
  beforeSave(style);
  const newId = await db.styles.put(style);
  return handleSave(style, reason, newId);
}

/**
 * @param {StyleObj} style
 * @param {string|false} [reason] - false = no broadcast
 * @param {number} [id]
 * @returns {StyleObj}
 */
export function handleSave(style, reason, id = style.id) {
  if (style.id == null) style.id = id;
  const data = id2data(id);
  if (!data) {
    storeInMap(style);
  } else {
    data.style = style;
  }
  if (reason !== 'sync') {
    API.sync.putDoc(style);
  }
  if (reason !== false) broadcastStyleUpdated(style, reason, !data);
  return style;
}

// get styles matching a URL, including sloppy regexps and excluded items.
function getAppliedCode(query, data) {
  const result = urlMatchStyle(query, data);
  if (result === 'included') {
    // return all sections
    return data.sections.map(s => s.code);
  }
  if (result !== true) {
    return;
  }
  const code = [];
  for (const section of data.sections) {
    if (urlMatchSection(query, section) === true && !styleCodeEmpty(section)) {
      code.push(section.code);
    }
  }
  return code.length && code;
}

async function init() {
  const [order, styles = []] = await Promise.all([
    API.prefsDb.get(orderWrap.id),
    db.styles.getAll(),
    prefs.ready,
  ]);
  const updated = await Promise.all(styles.map(fixKnownProblems).filter(Boolean));
  if (updated.length) setTimeout(db.styles.putMany, 0, updated);
  setOrderImpl(order, {store: false});
  styles.forEach(storeInMap);
  bgReady._resolveStyles();
}

function fixKnownProblems(style, initIndex, initArray) {
  if (!style || !style.id) style = {id: Date.now()};
  let res = 0;
  for (const key in MISSING_PROPS) {
    if (!style[key]) {
      style[key] = MISSING_PROPS[key](style);
      res = 1;
    }
  }
  /* delete if value is null, {}, [] */
  for (const key in style) {
    const v = style[key];
    if (v == null || typeof v === 'object' && isEmptyObj(v)) {
      delete style[key];
      res = 1;
    }
  }
  /* Upgrade the old way of customizing local names */
  const {originalName} = style;
  if (originalName) {
    if (originalName !== style.name) {
      style.customName = style.name;
      style.name = originalName;
    }
    delete style.originalName;
    res = 1;
  }
  /* wrong homepage url in 1.5.20-1.5.21 due to commit 1e5f118d */
  for (const key of ['url', 'installationUrl']) {
    const url = style[key];
    const fixedUrl = url && url.replace(/([^:]\/)\//, '$1');
    if (fixedUrl !== url) {
      res = 1;
      style[key] = fixedUrl;
    }
  }
  let v;
  /* USO bug, duplicate "update" subdomain, see #523 */
  if ((v = style.md5Url) && v.includes('update.update.userstyles')) {
    res = style.md5Url = v.replace('update.update.userstyles', 'update.userstyles');
  }
  /* Outdated USO-archive links */
  if (`${style.url}${style.installationUrl}`.includes('https://33kk.github.io/uso-archive/')) {
    delete style.url;
    delete style.installationUrl;
  }
  /* Default homepage URL for external styles installed from a known distro */
  if (
    (!style.url || !style.installationUrl) &&
    (v = style.updateUrl) &&
    (v = URLS.makeInstallUrl(v) ||
      (v = /\d+/.exec(style.md5Url)) && `${URLS.uso}styles/${v[0]}`
    )
  ) {
    if (!style.url) res = style.url = v;
    if (!style.installationUrl) res = style.installationUrl = v;
  }
  if (initArray && (
    !Array.isArray(v = style.sections) && (v = 0, true) ||
    /* @import must precede `vars` that we add at beginning */
    !isEmptyObj((style[UCD] || {}).vars) && v.some(hasVarsAndImport)
  )) {
    if (!v && !style.sourceCode) {
      style.customName = 'Damaged style #' + (style.id || initIndex);
      style.sections = [{code: '/* No sections or sourceCode */'}];
      return style;
    }
    return API.usercss.buildCode(style);
  }
  return res && style;
}

function hasVarsAndImport({code}) {
  return code.startsWith(':root {\n  --') && /@import\s/i.test(code);
}

function urlMatchExclusion(e) {
  return compileExclusion(e).test(this.urlWithoutParams);
}

function urlMatchStyle(query, style) {
  let ovr;
  if ((ovr = style.exclusions) && ovr.some(urlMatchExclusion, query)) {
    return 'excluded';
  }
  if (!style.enabled) {
    return 'disabled';
  }
  if (!colorScheme.shouldIncludeStyle(style)) {
    return 'excludedScheme';
  }
  if ((ovr = style.inclusions) && ovr.some(urlMatchExclusion, query)) {
    return 'included';
  }
  return true;
}

function urlMatchSection(query, section, skipEmptyGlobal) {
  let dd, ddL, pp, ppL, rr, rrL, uu, uuL;
  if (
    (dd = section.domains) && (ddL = dd.length) && dd.some(urlMatchDomain, query) ||
    (pp = section.urlPrefixes) && (ppL = pp.length) && pp.some(urlMatchPrefix, query) ||
    /* Per the specification the fragment portion is ignored in @-moz-document:
       https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
       but the spec is outdated and doesn't account for SPA sites,
       so we only respect it for `url()` function */
    (uu = section.urls) && (uuL = uu.length) && (
      uu.includes(query.url) ||
      uu.includes(query.urlWithoutHash)
    ) ||
    (rr = section.regexps) && (rrL = rr.length) && rr.some(urlMatchRegexp, query)
  ) {
    return true;
  }
  /*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  */
  if (rrL && rr.some(urlMatchRegexpSloppy, query)) {
    return 'sloppy';
  }
  // TODO: check for invalid regexps?
  return !rrL && !ppL && !uuL && !ddL &&
    !query.isOwnPage && // We allow only intentionally targeted sections for own pages
    (!skipEmptyGlobal || !styleCodeEmpty(section));
}
/** @this {MatchQuery} */
function urlMatchDomain(d) {
  const _d = this.domain;
  return d === _d ||
    _d[_d.length - d.length - 1] === '.' && _d.endsWith(d);
}
/** @this {MatchQuery} */
function urlMatchPrefix(p) {
  return p && this.url.startsWith(p);
}
/** @this {MatchQuery} */
function urlMatchRegexp(r) {
  return (!this.isOwnPage || /\bextension\b/.test(r)) &&
    compileRe(r).test(this.url);
}
/** @this {MatchQuery} */
function urlMatchRegexpSloppy(r) {
  return (!this.isOwnPage || /\bextension\b/.test(r)) &&
    compileSloppyRe(r).test(this.url);
}

function createCompiler(compile) {
  // FIXME: FIFO cache doesn't work well here, if we want to match many
  // regexps more than the cache size, we will never hit the cache because
  // the first cache is deleted. So we use a simple map but it leaks memory.
  const cache = new Map();
  return text => {
    let re = cache.get(text);
    if (!re) {
      re = tryRegExp(compile(text));
      if (!re) {
        re = BAD_MATCHER;
      }
      cache.set(text, re);
    }
    return re;
  };
}

function compileGlob(text) {
  return stringAsRegExpStr(text)
    .replace(/\\\\\\\*|\\\*/g, m => m.length > 2 ? m : '.*');
}

function buildExclusion(text) {
  // match pattern
  const match = text.match(/^(\*|[\w-]+):\/\/(\*\.)?([\w.]+\/.*)/);
  if (!match) {
    return '^' + compileGlob(text) + '$';
  }
  return '^' +
    (match[1] === '*' ? '[\\w-]+' : match[1]) +
    '://' +
    (match[2] ? '(?:[\\w.]+\\.)?' : '') +
    compileGlob(match[3]) +
    '$';
}

function buildCache(cache, url, styleList) {
  const query = new MatchQuery(url);
  for (const {style, appliesTo, preview} of styleList) {
    // getSectionsByUrl only needs enabled styles
    const code = style.enabled && getAppliedCode(query, preview || style);
    if (code) {
      buildCacheEntry(cache, style, code);
      appliesTo.add(url);
    }
  }
}

function buildCacheEntry(cache, style, code = style.code) {
  /** @type {InjectedStyle} */
  cache.sections[style.id] = {
    code,
    id: style.id,
    name: style.customName || style.name,
  };
}

/** @return {Generator<StyleObj>} */
export function *iterStyles() {
  for (const v of dataMap.values()) yield v.style;
}

/** uuidv4 helper: converts to a 4-digit hex string and adds "-" at required positions */
function hex4dashed(num, i) {
  return (num + 0x10000).toString(16).slice(-4) + (i >= 1 && i <= 4 ? '-' : '');
}

async function setOrderImpl(data, {broadcast, calc = true, store = true, sync} = {}) {
  if (!data || !data.value || deepEqual(data.value, orderWrap.value)) {
    return;
  }
  Object.assign(orderWrap, data, sync && {_rev: Date.now()});
  if (calc) {
    for (const [type, group] of Object.entries(data.value)) {
      const dst = order[type] = {};
      group.forEach((uuid, i) => {
        const id = uuidIndex.get(uuid);
        if (id) dst[id] = i;
      });
    }
  }
  if (broadcast) {
    broadcastInjectorConfig('order', order);
  }
  if (store) {
    await API.prefsDb.put(orderWrap, orderWrap.id);
  }
  if (sync) {
    API.sync.putDoc(orderWrap);
  }
}

//#endregion

export {
  id2style as get,
};
