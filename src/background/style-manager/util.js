import {kExclusions, kInclusions, kInjectionOrder, UCD} from '@/js/consts';
import * as URLS from '@/js/urls';
import {deepEqual, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import broadcastInjectorConfig from '../broadcast-injector-config';
import {uuidIndex} from '../common';
import {prefsDB} from '../db';
import * as syncMan from '../sync-manager';
import {updateSections} from './cache';

/** @type {Map<number,StyleObj>} */
export const styleMap = new Map();
/** @type {Map<StyleObj,StyleObj>} */
export const stylePreviewMap = new Map();

export const order = /** @type {Injection.Order} */{main: {}, prio: {}};
export const orderWrap = {
  id: kInjectionOrder,
  value: mapObj(order, () => []),
  _id: `${chrome.runtime.id}-${kInjectionOrder}`,
  _rev: 0,
};

export function calcRemoteId({md5Url, updateUrl, [UCD]: ucd} = {}) {
  let id;
  id = (id = /\d+/.test(md5Url) || URLS.extractUsoaId(updateUrl)) && `uso-${id}`
    || (id = URLS.extractUswId(updateUrl)) && `usw-${id}`
    || '';
  return id && [
    id,
    !!ucd?.vars,
  ];
}

/** @returns {StyleObj|void} */
export const getById = id => styleMap.get(+id);

/** @returns {StyleObj|void} */
export const getByUuid = uuid => styleMap.get(uuidIndex.get(uuid));

/** @returns {StyleObj} */
export const mergeWithMapped = style => ({
  ...styleMap.get(style.id) || {
    enabled: true,
    installDate: Date.now(),
  },
  ...style,
});

export function broadcastStyleUpdated({enabled, id}, reason, isNew, msg) {
  updateSections(id);
  return broadcast({
    method: isNew ? 'styleAdded' : 'styleUpdated',
    style: {id, enabled},
    reason,
    ...msg,
  });
}

export async function setOrderImpl(data, {
  broadcast: broadcastAllowed,
  calc = true,
  store = true,
  sync,
} = {}) {
  const groups = data?.value;
  if (!groups || deepEqual(groups, orderWrap.value)) {
    return;
  }
  Object.assign(orderWrap, data, sync && {_rev: Date.now()});
  if (calc) {
    for (const type in groups) {
      const src = groups[type];
      const dst = order[type] = {};
      let uniq = true;
      for (let i = 0, styleId, iDup; i < src.length; i++) {
        if ((styleId = uuidIndex.get(src[i]))) {
          if ((iDup = dst[styleId]) >= 0)
            uniq = src[iDup] = false;
          dst[styleId] = i;
        }
      }
      if (!uniq) groups[type] = src.filter(Boolean);
    }
  }
  if (broadcastAllowed) {
    broadcastInjectorConfig('order', order);
  }
  if (store) {
    await prefsDB.put(orderWrap, orderWrap.id);
  }
  if (sync) {
    syncMan.putDoc(orderWrap);
  }
}

/** @param {StyleObj} style */
export function storeInMap(style) {
  const {id} = style;
  styleMap.set(id, style);
  stylePreviewMap.delete(id);
  uuidIndex.set(style._id, id);
}

export function toggleSiteOvrImpl(style, val, type, add) {
  type = type ? kInclusions : kExclusions;
  let list = style[type];
  if (add) {
    if (!list) list = style[type] = [val];
    else if (!list.includes(val)) list.push(val);
  } else if (list && (val = list.indexOf(val)) >= 0) {
    if (list.length > 1) list.splice(val, 1);
    else style[type] = null; // to overwrite the prop in a style of broadcast receiver
  } else {
    type = false;
  }
  return !!type;
}

uuidIndex.addCustom(orderWrap, {set: setOrderImpl});
