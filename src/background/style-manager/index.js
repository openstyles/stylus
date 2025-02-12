import {IMPORT_THROTTLE, k_size, kStyleViaXhr, kUrl, pKeepAlive, UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {calcStyleDigest, styleCodeEmpty} from '@/js/sections-util';
import {calcObjSize, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import * as colorScheme from '../color-scheme';
import {uuidIndex} from '../common';
import {db, draftsDB} from '../db';
import * as syncMan from '../sync-manager';
import tabCache from '../tab-manager';
import {getUrlOrigin} from '../tab-util';
import * as usercssMan from '../usercss-manager';
import * as uswApi from '../usw-api';
import cacheData, * as styleCache from './cache';
import {buildCache} from './cache-builder';
import './init';
import {onBeforeSave, onSaved} from './fixer';
import {urlMatchSection, urlMatchStyle} from './matcher';
import {
  broadcastStyleUpdated, calcRemoteId, dataMap, getById, getByUuid,
  mergeWithMapped, order, orderWrap, setOrderImpl,
} from './util';

export * from '../style-search-db';
export {getById as get};

/** @returns {Promise<void>} */
export async function config(id, prop, value) {
  const style = Object.assign({}, getById(id));
  const d = dataMap.get(id);
  style[prop] = (d.preview || {})[prop] = value;
  if (prop === 'inclusions' || prop === 'exclusions') styleCache.clear();
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

/** @returns {StylesByUrlResult[]} */
export function getByUrl(url, id = null) {
  // FIXME: do we want to cache this? Who would like to open popup rapidly
  // or search the DB with the same URL?
  const result = [];
  const query = {url};
  for (const {style} of id ? [dataMap.get(id)].filter(Boolean) : dataMap.values()) {
    let empty = true;
    let excluded = false;
    let excludedScheme = false;
    let included = false;
    let sloppy = false;
    let sectionMatched = false;
    let match = urlMatchStyle(query, style);
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
      match = urlMatchSection(query, section, true);
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
        style: getCore({id: style.id}),
      });
    }
  }
  return result;
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

/** @returns {Injection.Response} */
export function getSectionsByUrl(url, {id, init, dark} = {}) {
  if (dark != null)
    colorScheme.setSystemDark(dark);
  const p = prefs.__values;
  if (init && p.disableAll) {
    return {cfg: {off: true}};
  }
  const {sender = {}} = this || {};
  const {tab = {}, frameId, TDM} = sender;
  const isTop = !frameId || TDM || sender.type === 'main_frame'; // prerendering in onBeforeRequest
  const td = tabCache[sender.tabId || tab.id] || {};
  /** @type {Injection.Config} */
  const cfg = !id && {
    ass: p.styleViaASS,
    dark: isTop && colorScheme.isDark,
    // TODO: enable in FF when it supports sourceURL comment in style elements (also options.html)
    name: p.exposeStyleName,
    nonce: td.nonce?.[frameId],
    top: p.exposeIframes,
    topUrl: isTop ? '' : getUrlOrigin(tab.url || td[kUrl]?.[0]),
    wake: p[pKeepAlive] >= 0,
    order,
  };
  if (init === 'cfg') {
    return {cfg};
  }
  let res, cache;
  if (frameId === 0
  && init !== kStyleViaXhr
  && (res = td[kUrl])
  && (res = res[0]) !== url
  && res.split('#', 1)[0] === url.split('#', 1)[0]) {
    /* Chrome hides text frament from location.href of the page e.g. #:~:text=foo
       so we'll use the real URL reported by webNavigation API.
       TODO: if FF will do the same, this won't work as is: FF reports onCommitted too late */
    url = res || url;
  }
  cache = cacheData.get(url);
  if (!cache) {
    cache = {url, sections: {}};
    buildCache(cache, url);
  } else if ((res = cache.maybeMatch)) {
    buildCache(cache, url, res);
  }
  styleCache.add(cache);
  res = cache.sections;
  res = id
    ? ((res = res[id])) ? [res] : []
    : Object.values(res);
  if (init === true && res.length) {
    (td[kUrl] ??= {})[frameId] ??= url;
  }
  return {
    cfg,
    sections: res,
  };
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

/** @returns {number} style id */
export function remove(id, reason) {
  const {style, appliesTo} = dataMap.get(id);
  const sync = reason !== 'sync';
  const uuid = style._id;
  db.delete(id);
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
  mapObj(orderWrap.value, (group, type) => {
    delete order[type][id];
    const i = group.indexOf(uuid);
    if (i >= 0) group.splice(i, 1);
  });
  setOrderImpl(orderWrap, {calc: false});
  if (style._usw && style._usw.token) {
    // Must be called after the style is deleted from dataMap
    uswApi.revoke(id);
  }
  draftsDB.delete(id).catch(() => {});
  broadcast({
    method: 'styleDeleted',
    style: {id},
  });
  return id;
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
  await save({...getById(id), enabled}, 'toggle');
}

/** @returns {Promise<void>} */
export async function toggleOverride(id, rule, isInclusion, isAdd) {
  const style = Object.assign({}, getById(id));
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
  styleCache.clear();
  await save(style, 'config');
}
