import {kInjectionOrder, UCD} from '@/js/consts';
import * as URLS from '@/js/urls';
import {deepEqual, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import broadcastInjectorConfig from '../broadcast-injector-config';
import {uuidIndex} from '../common';
import {prefsDB} from '../db';
import * as syncMan from '../sync-manager';
import {delSections} from './cache';

/** @type {StyleDataMap} */
export const dataMap = new Map();

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

/** @returns {StyleObj} */
const createNewStyle = () => ({
  enabled: true,
  installDate: Date.now(),
});

/** @returns {StyleObj|void} */
export const getById = id => dataMap.get(+id)?.style;

/** @returns {StyleObj|void} */
export const getByUuid = uuid => getById(uuidIndex.get(uuid));

/** @returns {StyleObj} */
export const mergeWithMapped = style => ({
  ...getById(style.id) || createNewStyle(),
  ...style,
});

export function broadcastStyleUpdated({enabled, id}, reason, isNew) {
  delSections(id);
  return broadcast({
    method: isNew ? 'styleAdded' : 'styleUpdated',
    reason,
    style: {id, enabled},
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

/** @returns {void} */
export function storeInMap(style) {
  dataMap.set(style.id, {
    style,
    urls: new Set(),
  });
  uuidIndex.set(style._id, style.id);
}

uuidIndex.addCustom(orderWrap, {set: setOrderImpl});
