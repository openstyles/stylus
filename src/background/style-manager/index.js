import {kUrl, UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {calcStyleDigest, styleCodeEmpty} from '@/js/sections-util';
import {CHROME} from '@/js/ua';
import {isEmptyObj, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import * as colorScheme from '../color-scheme';
import {bgBusy, bgInit, safeTimeout, uuidIndex} from '../common';
import {db} from '../db';
import * as tabMan from '../tab-manager';
import {getUrlOrigin} from '../tab-util';
import * as usercssTemplate from '../usercss-template';
import * as styleCache from './cache';
import {buildCache, buildCacheForStyle} from './cache-builder';
import './connector';
import {fixKnownProblems, onBeforeSave, onSaved} from './fixer';
import {urlMatchSection, urlMatchStyle} from './matcher';
import {
  broadcastStyleUpdated, calcRemoteId, dataMap, getById, getByUuid, getOrder, id2data, iterStyles,
  mergeWithMapped, order, orderWrap, setOrderImpl, storeInMap,
} from './util';

bgInit.push(async () => {
  __.DEBUGLOG('styleMan init...');
  const [orderFromDb, styles = []] = await Promise.all([
    API.prefsDb.get(orderWrap.id),
    db.getAll(),
    styleCache.loadAll(),
  ]);
  __.DEBUGLOG('styleMan fixKnownProblems...');
  const updated = await Promise.all(styles.map(fixKnownProblems).filter(Boolean));
  if (updated[0]) bgBusy.then(() => setTimeout(db.putMany, 0, updated));
  setOrderImpl(orderFromDb, {store: false});
  styles.forEach(storeInMap);
  styleCache.hydrate(dataMap);
  colorScheme.onChange(() => {
    for (const {style} of dataMap.values()) {
      if (colorScheme.SCHEMES.includes(style.preferScheme)) {
        broadcastStyleUpdated(style, 'colorScheme');
      }
    }
  }, !__.MV3);
  __.DEBUGLOG('styleMan init done');
});

styleCache.setOnDeleted(val => {
  for (const id in val.sections) {
    dataMap.get(+id)?.appliesTo.delete(val.url);
  }
});

export * from '../style-search-db';
export {getById as get, getOrder};

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
  API.drafts.delete(style.id).catch(() => {});
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
  const styles = id
    ? [getById(id)].filter(Boolean)
    : iterStyles();
  const query = {url};
  for (const style of styles) {
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
        style: getCodelessStyles([style.id], true)[0],
      });
    }
  }
  return result;
}

export function getCodelessStyles(ids, forPopup) {
  const res = [];
  for (const v of ids || dataMap.values()) {
    const style = {...(ids ? dataMap.get(v) : v).style};
    let dst;
    if (!forPopup) {
      dst = [];
      for (let i = 0, src = style.sections; i < src.length; i++) {
        dst[i] = {...src[i], code: undefined};
      }
    } else if (UCD in style) {
      style[UCD] = {vars: !isEmptyObj(style[UCD].vars) && {foo: 1}};
    }
    style.sourceCode = undefined;
    style.sections = dst;
    res.push(style);
  }
  return res;
}

export function getEditClientData(id) {
  const style = getById(id);
  const isUC = style ? UCD in style : prefs.__values.newStyleAsUsercss;
  return /** @namespace StylusClientData */ {
    style,
    isUC,
    si: style && API.data.get('editorScrollInfo' + id),
    template: !style && isUC && (usercssTemplate.value || usercssTemplate.load()),
  };
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

/** @returns {Injection} */
export function getSectionsByUrl(url, id, isInitialApply) {
  const p = prefs.__values;
  if (isInitialApply && p.disableAll) {
    return {cfg: {off: true}};
  }
  const {sender = {}} = this || {};
  const {tab = {}, frameId, TDM} = sender;
  const isTop = !frameId || TDM || sender.type === 'main_frame'; // prerendering in onBeforeRequest
  /** @type {InjectionConfig} */
  const cfg = !id && {
    ass: p.styleViaASS,
    dark: isTop && colorScheme.isDark,
    // TODO: enable in FF when it supports sourceURL comment in style elements (also options.html)
    name: CHROME && p.exposeStyleName,
    nonce: tabMan.get(tab.id, 'nonce', frameId),
    top: isInitialApply && p.exposeIframes && (
      isTop ? '' // apply.js will use location.origin
        : getUrlOrigin(tab.url || tabMan.get(sender.tabId || tab.id, kUrl))
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
    url = tabMan.get(tab.id, kUrl) || url;
  }
  /** @type {CachedInjectedStyles} */
  let cache = styleCache.get(url);
  if (!cache) {
    cache = {
      url,
      sections: {},
      maybeMatch: new Set(),
    };
    buildCache(cache, url, dataMap.values());
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

/** @returns {Promise<{style?:StyleObj, err?:?}[]>} */
export async function importMany(items) {
  const res = [];
  const styles = [];
  for (const style of items) {
    try {
      onBeforeSave(style);
      if (style.sourceCode && style[UCD]) {
        await API.usercss.buildCode(style);
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
      buildCacheForStyle(style);
      res[i] = {style};
    }
  }
  safeTimeout(() => messages.forEach(args => broadcastStyleUpdated(...args)), 100);
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

/** @returns {number} style id */
export function remove(id, reason) {
  const {style, appliesTo} = dataMap.get(id);
  const sync = reason !== 'sync';
  const uuid = style._id;
  db.delete(id);
  if (sync) API.sync.remove(uuid, Date.now());
  for (const url of appliesTo) {
    const cache = styleCache.get(url);
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
