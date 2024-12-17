import {UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as URLS from '@/js/urls';
import {deepEqual, isEmptyObj, mapObj} from '@/js/util';
import {broadcast} from '../broadcast';
import broadcastInjectorConfig from '../broadcast-injector-config';
import {uuidIndex} from '../common';
import {buildCacheForStyle} from './cache-builder';
import {fixKnownProblems} from './fixer';

/** @type {Map<number,StyleMapData>} */
export const dataMap = new Map();
/** @returns {StyleMapData|void} */
export const id2data = dataMap.get.bind(dataMap);

const INJ_ORDER = 'injectionOrder';
export const order = /** @type {InjectionOrder} */{main: {}, prio: {}};
export const orderWrap = {
  id: INJ_ORDER,
  value: mapObj(order, () => []),
  _id: `${chrome.runtime.id}-${INJ_ORDER}`,
  _rev: 0,
};
/** @returns {{[type: string]: string[]}}>} */
export const getOrder = () => orderWrap.value;

/** uuidv4 helper: converts to a 4-digit hex string and adds "-" at required positions */
const hex4 = num => (num < 0x1000 ? num + 0x10000 : num).toString(16).slice(-4);

export const makeRandomUUID = !__.MV3 && (() => {
  const seeds = crypto.getRandomValues(new Uint16Array(8));
  // 00001111-2222-M333-N444-555566667777
  return hex4(seeds[0]) + hex4(seeds[1]) + '-' +
    hex4(seeds[2]) + '-' +
    hex4(seeds[3] & 0x0FFF | 0x4000) + '-' + // UUID version 4, M = 4
    hex4(seeds[4] & 0x3FFF | 0x8000) + '-' + // UUID variant 1, N = 8..0xB
    hex4(seeds[5]) + hex4(seeds[6]) + hex4(seeds[7]);
});

export function calcRemoteId({md5Url, updateUrl, [UCD]: ucd} = {}) {
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

export function broadcastStyleUpdated(style, reason, isNew) {
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

/** @return {Generator<StyleObj>} */
export function *iterStyles() {
  for (const v of dataMap.values()) yield v.style;
}

export function onBeforeSave(style) {
  if (!style.name) {
    throw new Error('Style name is empty');
  }
  if (!style._id) {
    style._id = crypto.randomUUID?.() || makeRandomUUID();
  }
  if (!style.id) {
    delete style.id;
  }
  style._rev = Date.now();
  fixKnownProblems(style);
}

/**
 * @param {StyleObj} style
 * @param {string|false} [reason] - false = no broadcast
 * @param {number} [id]
 * @returns {StyleObj}
 */
export function onSaved(style, reason, id = style.id) {
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

export async function setOrderImpl(data, {
  broadcast: broadcastAllowed,
  calc = true,
  store = true,
  sync,
} = {}) {
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
  if (broadcastAllowed) {
    broadcastInjectorConfig('order', order);
  }
  if (store) {
    await API.prefsDb.put(orderWrap, orderWrap.id);
  }
  if (sync) {
    API.sync.putDoc(orderWrap);
  }
}

/** @returns {void} */
export function storeInMap(style) {
  dataMap.set(style.id, {
    style,
    appliesTo: new Set(),
  });
  uuidIndex.set(style._id, style.id);
}

uuidIndex.addCustom(orderWrap, {set: setOrderImpl});
