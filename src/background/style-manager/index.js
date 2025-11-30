import {
  IMPORT_THROTTLE, k_size, kExclusions, kInclusions, kOverridden, kUrl, pDisableAll,
  pExposeIframes, pKeepAlive, pStyleViaASS, pStyleViaXhr, UCD,
} from '@/js/consts';
import {__values} from '@/js/prefs';
import {calcStyleDigest, styleCodeEmpty} from '@/js/sections-util';
import {calcObjSize, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import * as colorScheme from '../color-scheme';
import {uuidIndex} from '../common';
import {db, draftsDB} from '../db';
import {isOptionSite, optionSites} from '../option-sites';
import * as syncMan from '../sync-manager';
import tabCache from '../tab-manager';
import {getUrlOrigin} from '../tab-util';
import * as usercssMan from '../usercss-manager';
import * as uswApi from '../usw-api';
import cacheData, * as styleCache from './cache';
import {buildCache} from './cache-builder';
import './init';
import {onBeforeSave, onSaved} from './fixer';
import {urlMatchOverride, urlMatchSection} from './matcher';
import {
  broadcastStyleUpdated, calcRemoteId, dataMap, getById, getByUuid, mergeWithMapped, order,
  orderWrap, setOrderImpl,
} from './util';

export * from '../style-search-db';
export {getById as get};

/** @returns {Promise<void>} */
export async function config(id, prop, value) {
  const style = Object.assign({}, getById(id));
  const d = dataMap.get(id);
  style[prop] = (d.preview || {})[prop] = value;
  if (prop === kInclusions || prop === kOverridden || prop === kExclusions)
    styleCache.clear();
  await save(style, 'config');
}

/** @returns {Promise<StyleObj>} */
export function editSave(style) {
  style = mergeWithMapped(style);
  style.updateDate = Date.now();
  draftsDB.delete(style.id).catch(() => {});
  return save(style, 'editSave');
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

/** @returns {{[type: string]: string[]}}>} */
export const getOrder = () => orderWrap.value;

/** @returns {{[type: string]: StyleObj[]}}>} */
export function getAllOrdered(keys) {
  const res = mapObj(orderWrap.value, group => group.map(getByUuid).filter(Boolean));
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

/**
 * @param {string} url
 * @param {number} [id]
 * @returns {MatchUrlResult[]}
 */
export function getByUrl(url, id) {
  // FIXME: do we want to cache this? Who would like to open popup rapidly
  // or search the DB with the same URL?
  const results = [];
  const query = {url};
  for (const {style} of id ? [dataMap.get(id)].filter(Boolean) : dataMap.values()) {
    let ovr;
    let matching;
    /** Make sure to use the same logic in getAppliedCode and getByUrl */
    const res = {
      excluded: (ovr = style.exclusions) && ovr.some(urlMatchOverride, query),
      excludedScheme: !colorScheme.themeAllowsStyle(style),
      included: matching = (ovr = style[kInclusions]) && ovr.some(urlMatchOverride, query),
      [kOverridden]: !matching && style[kOverridden] && ovr?.length,
    };
    const isIncluded = matching;
    let empty = true;
    let sloppy = false;
    for (let arr = style.sections, i = 0; i < arr.length && (!matching || empty || !sloppy); i++) {
      const sec = arr[i];
      const secMatch = isIncluded || urlMatchSection(query, sec, true);
      if (!secMatch)
        continue;
      matching = true;
      sloppy ||= secMatch === 'sloppy';
      empty &&= styleCodeEmpty(sec);
    }
    if (matching) {
      res.empty = empty;
      res.sloppy = sloppy;
      res.style = getCore({id: style.id});
      results.push(res);
    }
  }
  return results;
}

/**
 * @param {{}} [opts]
 * @param {number} [opts.id] - process and return only one style
 * @param {boolean} [opts.code] - include `code` and `sourceCode`
 * @param {boolean} [opts.sections] - include `sections`
 * @param {boolean} [opts.vars] - include `usercssData.vars`
 * @return {StyleObj[] | StyleObj}
 */
export function getCore({id, code, sections, size, vars} = {}) {
  const res = [];
  for (let {style} of id ? [dataMap.get(id)] : dataMap.values()) {
    style = {...style};
    let tmp;
    if (size)
      style[k_size] = calcObjSize(style);
    if (!code && sections)
      tmp = style.sections.map(sec => ({...sec, code: undefined}));
    if (!code || !sections)
      style.sections = tmp;
    if (!code)
      style.sourceCode = undefined;
    if (!vars && (tmp = style[UCD]) && tmp.vars)
      style[UCD] = {...tmp, vars: {}};
    res.push(style);
  }
  return id ? res[0] : res;
}

/** @returns {string | {[remoteId:string]: styleId}}>} */
export function getRemoteInfo(id) {
  if (id) return calcRemoteId(getById(id));
  const res = {};
  for (const {style} of dataMap.values()) {
    const [rid, vars] = calcRemoteId(style);
    if (rid) res[rid] = [style.id, vars];
  }
  return res;
}

/**
 * @param {string} url
 * @param {number} [id]
 * @param {boolean | 'cfg' | 'styleViaXhr'} [init]
 * @param {boolean} [dark]
 * @returns {Injection.Response}
 */
export function getSectionsByUrl(url, {id, init, dark} = {}) {
  // Init the scheme once, then rely on matchMedia->onchange event
  // TODO: rework caching to set just the sender's scheme i.e. not globally
  if (dark != null && colorScheme.isDark == null)
    colorScheme.setSystemDark(dark);
  if (init && __values[pDisableAll]) {
    return {cfg: {off: true}};
  }
  let cache, v;
  const res = {};
  const {sender = {}} = this || {};
  const {tab = {}, frameId, TDM} = sender;
  const isTop = !frameId || TDM || sender.type === 'main_frame'; // prerendering in onBeforeRequest
  const td = tabCache[sender.tabId || tab.id] || {};
  /** @type {Injection.Config} */
  res.cfg = !id && {
    ass: __values[pStyleViaASS] &&
      (!(v = optionSites[pStyleViaASS]) || isOptionSite(v, url)),
    dark: isTop && colorScheme.isDark,
    // TODO: enable in FF when it supports sourceURL comment in style elements (also options.html)
    name: __values.exposeStyleName,
    nonce: td.nonce?.[frameId],
    top: __values[pExposeIframes] &&
      (!(v = optionSites[pExposeIframes]) || isOptionSite(v, url)),
    topUrl: isTop ? '' : getUrlOrigin(tab.url || td[kUrl]?.[0]),
    wake: __values[pKeepAlive] >= 0,
    order,
  };
  if (init === 'cfg') {
    return res;
  }
  if (frameId === 0
  && init !== pStyleViaXhr
  && (v = td[kUrl])
  && (v = v[0]) !== url
  && v.split('#', 1)[0] === url.split('#', 1)[0]) {
    /* Chrome hides text frament from location.href of the page e.g. #:~:text=foo
       so we'll use the real URL reported by webNavigation API.
       TODO: if FF will do the same, this won't work as is: FF reports onCommitted too late */
    url = v || url;
  }
  cache = cacheData.get(url);
  if (!cache) {
    cache = {url, sections: {}};
    buildCache(cache, url);
  } else if ((v = cache.maybeMatch)) {
    buildCache(cache, url, v);
  }
  styleCache.add(cache);
  v = cache.sections;
  v = id
    ? ((v = v[id])) ? [v] : []
    : Object.values(v);
  if (init === true && v.length) {
    (td[kUrl] ??= {})[frameId] ??= url;
  }
  res.sections = v;
  return res;
}

/** @returns {Promise<{style?:StyleObj, err?:?}[]>} */
export async function importMany(items) {
  const res = [];
  const styles = [];
  for (const style of items) {
    try {
      onBeforeSave(style);
      if (style.sourceCode && style[UCD]) {
        await usercssMan.buildCode(style);
      }
      res.push(styles.push(style) - 1);
    } catch (err) {
      res.push({err});
    }
  }
  const events = await db.putMany(styles);
  const messages = [];
  for (let i = 0, r; i < res.length; i++) {
    r = res[i];
    if (!r.err) {
      const id = events[r];
      const method = dataMap.has(id) ? 'styleUpdated' : 'styleAdded';
      const style = onSaved(styles[r], false, id);
      messages.push([style, 'import', method]);
      res[i] = {
        style: {
          ...style,
          [k_size]: calcObjSize(style),
        },
      };
    }
  }
  styleCache.clear();
  setTimeout(() => messages.forEach(args => broadcastStyleUpdated(...args)), IMPORT_THROTTLE);
  return Promise.all(res);
}

/** @returns {Promise<StyleObj>} */
export async function install(style, reason = dataMap.has(style.id) ? 'update' : 'install') {
  style = mergeWithMapped(style);
  style.originalDigest = await calcStyleDigest(style);
  // FIXME: update updateDate? what about usercss config?
  return save(style, reason);
}

/** @param {StyleObj} style */
export async function preview(style) {
  let res = style.sourceCode || false;
  if (res) {
    res = await usercssMan.build({
      styleId: style.id,
      sourceCode: res,
      assignVars: true,
    });
    delete res.style.enabled;
    Object.assign(style, res.style);
  }
  dataMap.get(style.id).preview = style;
  broadcastStyleUpdated(style, 'editPreview');
  return res.log;
}

/**
 * @param {number} id
 * @param {string} [reason]
 * @param {boolean | number[] } [many]
 * @returns {number} style id
 */
export function remove(id, reason, many) {
  const {style, appliesTo} = dataMap.get(id);
  const sync = reason !== 'sync';
  const uuid = style._id;
  if (sync) syncMan.remove(uuid, Date.now());
  for (const url of appliesTo) {
    const cache = cacheData.get(url);
    if (cache) {
      delete cache.sections[id];
      styleCache.hit(cache);
    }
  }
  dataMap.delete(id);
  uuidIndex.delete(uuid);
  if (!many) {
    db.delete(id);
    draftsDB.delete(id).catch(() => {});
    for (const [type, group] of Object.entries(orderWrap.value)) {
      delete order[type][id];
      const i = group.indexOf(uuid);
      if (i >= 0) group.splice(i, 1);
    }
    setOrderImpl(orderWrap, {calc: false});
  }
  if (style._usw && style._usw.token) {
    // Must be called after the style is deleted from dataMap
    uswApi.revoke(id);
  }
  broadcast({
    method: 'styleDeleted',
    style: {id},
  });
  return id;
}

/**
 * @param {number[]} ids
 * @param {string} [reason]
 */
export function removeMany(ids, reason) {
  for (const item of ids)
    remove(item, reason, true);
  for (const type in orderWrap.value) {
    for (const id of ids) delete order[type][id];
    orderWrap.value[type] = orderWrap.value[type].filter(u => !ids.includes(uuidIndex.get(u)));
  }
  setOrderImpl(orderWrap, {calc: false});
  return Promise.all([
    db.deleteMany(ids),
    draftsDB.deleteMany(ids).catch(() => {}),
  ]);
}

/** @returns {Promise<StyleObj>} */
export async function save(style, reason) {
  onBeforeSave(style);
  const newId = await db.put(style);
  return onSaved(style, reason, newId);
}

/** @returns {Promise<void>} */
export async function setOrder(value) {
  await setOrderImpl({value}, {broadcast: true, sync: true});
}

/** @returns {Promise<void>} */
export async function toggle(id, enabled) {
  await save({...getById(id), enabled: !!enabled}, 'toggle');
}

/**
 * @param {number[]} ids
 * @param {boolean | number[]} enabled
 */
export async function toggleMany(ids, enabled) {
  const styles = [];
  let errors;
  for (let i = 0; i < ids.length; i++) {
    try {
      const {style} = dataMap.get(+ids[i]) || {};
      onBeforeSave(style);
      style.enabled = !!(Array.isArray(enabled) ? enabled[i] : enabled);
      styles.push(style);
    } catch (err) {
      (errors ??= {})[ids[i]] = err.message;
    }
  }
  if (styles.length) {
    await db.putMany(styles);
    for (const style of styles)
      onSaved(style, 'toggle', style.id);
  }
  if (errors) throw errors;
}

/** @returns {Promise<void>} */
export async function toggleOverride(id, rule, isInclusion, isAdd) {
  const style = Object.assign({}, getById(id));
  const type = isInclusion ? kInclusions : kExclusions;
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
  styleCache.clear();
  await save(style, 'config');
}
