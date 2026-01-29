import {
  IMPORT_THROTTLE, k_size, kExclusions, kInclusions, kOverridden, kTabOvr, kUrl, pDisableAll,
  pExposeIframes, pKeepAlive, pPatchCsp, pStyleViaASS, pStyleViaXhr, UCD,
} from '@/js/consts';
import {__values} from '@/js/prefs';
import {calcStyleDigest, styleCodeEmpty} from '@/js/sections-util';
import {calcObjSize, isEmptyObj, mapObj} from '@/js/util';
import {broadcast, broadcastExtension, sendTab} from '../broadcast';
import * as colorScheme from '../color-scheme';
import {uuidIndex} from '../common';
import {db, draftsDB} from '../db';
import {isOptionSite, optionSites} from '../option-sites';
import * as syncMan from '../sync-manager';
import {tabCache, set as tabSet} from '../tab-manager';
import {getUrlOrigin} from '../tab-util';
import * as usercssMan from '../usercss-manager';
import * as uswApi from '../usw-api';
import * as urlCache from './cache';
import './init';
import {onBeforeSave, onSaved} from './fixer';
import {matchOverrides, urlMatchOverride, urlMatchSection} from './matcher';
import {
  broadcastStyleUpdated, calcRemoteId, dataMap, getById, getByUuid, mergeWithMapped, order,
  orderWrap, setOrderImpl, toggleSiteOvrImpl,
} from './util';

export * from '../style-search-db';
export {getById as get, matchOverrides};

/** @returns {Promise<void>} */
export async function config(id, prop, value) {
  const style = getById(id);
  const d = dataMap.get(id);
  style[prop] = (d.preview || {})[prop] = value;
  if (prop === kInclusions || prop === kOverridden || prop === kExclusions)
    urlCache.updateSections(id);
  await save(style, 'config');
}

/** @returns {Promise<StyleObj>} */
export function editSave(style, msg) {
  style = mergeWithMapped(style);
  style.updateDate = Date.now();
  draftsDB.delete(style.id).catch(() => {});
  return save(style, 'editSave', msg);
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
 * @param {number} [id]
 * @param {number} [tabId]
 * @param {boolean} [needsOvrs]
 * @returns {MatchUrlResult|void}
 */
export function getByIdInTab(id, tabId, needsOvrs) {
  const urlObj = tabCache[tabId]?.[kUrl] || {};
  const urls = new Set();
  for (const frameId in urlObj) {
    const url = urlObj[frameId];
    if (!urls.has(url)) {
      urls.add(url);
      for (const v of getByUrl(url, id, tabId, needsOvrs)) {
        v.frameUrl = +frameId ? url : '';
        return v;
      }
    }
  }
}

/**
 * @param {string} url
 * @param {number} [id]
 * @param {number} [tabId]
 * @param {boolean} [needsOvrs]
 * @returns {MatchUrlResult[]}
 */
export function getByUrl(url, id, tabId, needsOvrs) {
  // FIXME: do we want to cache this? Who would like to open popup rapidly
  // or search the DB with the same URL?
  const results = [];
  const query = {url};
  const td = tabCache[tabId];
  const tabOverrides = td?.[kTabOvr];
  const tabCSP = td?.[pPatchCsp];
  for (const {style} of id ? [dataMap.get(id)].filter(Boolean) : dataMap.values()) {
    let ovr;
    let matching;
    /** Make sure to use the same logic in getAppliedCode and getByUrl
     * @type {MatchUrlResult} */
    const res = {
      excluded: !!(ovr = style.exclusions) && ovr.some(urlMatchOverride, query),
      excludedScheme: !colorScheme.themeAllowsStyle(style),
      included: matching = !!(ovr = style[kInclusions]) && ovr.some(urlMatchOverride, query),
      [kTabOvr]: tabOverrides?.[style.id] ?? null,
      [pPatchCsp]: tabCSP?.[style.id] || null,
      incOvr: !!(!matching && style[kOverridden] && ovr?.length),
      matchedOvrs: needsOvrs ? matchOverrides(style, url) : '',
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
      style[UCD] = {...tmp, vars: Object.keys(tmp.vars).length};
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
  let v;
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
  const cache = (v = urlCache.entries.get(url)) || new Map();
  const tabOvr = td[kTabOvr] || false;
  const secsArr = [];
  let {maybe} = cache;
  if (v && tabOvr)
    for (const styleId in tabOvr)
      if (tabOvr[styleId] && !cache.has(+styleId))
        (maybe ??= new Set()).add(+styleId);
  if (!v || maybe)
    urlCache.create(url, cache, maybe, tabOvr);
  urlCache.add(url, cache);
  for (const sec of !id ? cache.values() : ((v = cache.get(id))) ? [v] : [])
    if (tabOvr[sec.id] ?? !sec[kTabOvr])
      secsArr.push(sec);
  if (init === true && secsArr.length) {
    (td[kUrl] ??= {})[frameId] ??= url;
  }
  res.sections = secsArr;
  return res;
}

/** @returns {Promise<{style?:StyleObj, err?:?}[]>} */
export async function importMany(items) {
  const res = [];
  const styles = [];
  for (let style of items) {
    try {
      style = onBeforeSave(style) || style;
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
      const isNew = !dataMap.has(id);
      const style = onSaved(styles[r], false, id);
      messages.push([style, 'import', isNew]);
      res[i] = {
        style: getCore({id, sections: true, size: true}),
      };
    }
  }
  urlCache.entries.clear();
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
  const {style} = dataMap.get(id);
  const sync = reason !== 'sync';
  const uuid = style._id;
  if (sync) syncMan.remove(uuid, Date.now());
  urlCache.updateSections(id, true);
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
export async function save(style, reason, msg) {
  const newId = await db.put(onBeforeSave(style) || style);
  return onSaved(style, reason, newId, msg);
}

/** @returns {Promise<void>} */
export async function setOrder(value) {
  await setOrderImpl({value}, {broadcast: true, sync: true});
}

/** @returns {Promise<void>} */
export async function toggle(id, enabled) {
  const style = getById(id);
  style.enabled = !!enabled;
  await save(style, 'toggle');
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

/**
 * @param {number} id
 * @param {string} val - pattern
 * @param {boolean} type - true: inclusions, false: exclusions
 * @param {boolean} isAdd - true: add val to the list, false: remove it
 * @returns {Promise<void>}
 */
export function toggleSiteOvr(id, val, type, isAdd) {
  const style = dataMap.get(id).style;
  if (toggleSiteOvrImpl(style, val, type, isAdd) + toggleSiteOvrImpl(style, val, !type, false)) {
    urlCache.updateSections(id);
    return save(style, 'config', {
      style: {id, enabled: isAdd ? type : style.enabled},
    });
  }
}

/**
 * @param {number} tabId
 * @param {TabCacheEntry['tabOvr']} overrides - `null` to remove
 * @returns {Promise<void>}
 */
export function toggleTabOvrMany(tabId, overrides) {
  const messages = [];
  const td = tabCache[tabId];
  const url = td[kUrl][0];
  const cache = urlCache.entries.get(url);
  let tabOvr = td[kTabOvr] || {}; // not assigning it yet as it may end up empty
  for (const key in overrides) {
    const id = +key;
    const val = overrides[key];
    const data = dataMap.get(id);
    const dirty = tabOvr[key] != val; // eslint-disable-line eqeqeq
    if (!data || !dirty) continue;
    if (val == null) delete tabOvr[key]; else tabOvr[key] = val;
    if (cache) (cache.maybe ??= new Set()).add(id);
    messages.push({
      method: 'styleUpdated',
      reason: kTabOvr,
      style: {id, enabled: val ?? data.style.enabled},
    });
  }
  if (td[kTabOvr] || !isEmptyObj(tabOvr) || (tabOvr = undefined, true)) {
    tabSet(tabId, kTabOvr, tabOvr);
  }
  if (messages.length) {
    sendTab(tabId, messages, null, /*multi=*/true);
    broadcastExtension(messages, /*multi=*/true);
  }
}
