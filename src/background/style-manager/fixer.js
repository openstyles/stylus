import {UCD} from '@/js/consts';
import * as URLS from '@/js/urls';
import {isEmptyObj} from '@/js/util';
import * as syncMan from '../sync-manager';
import * as usercssMan from '../usercss-manager';
import {buildCacheForStyle} from './cache-builder';
import {broadcastStyleUpdated, dataMap, storeInMap} from './util';

/** uuidv4 helper: converts to a 4-digit hex string and adds "-" at required positions */
const hex4 = num => (num < 0x1000 ? num + 0x10000 : num).toString(16).slice(-4);

const makeRandomUUID = crypto.randomUUID?.bind(crypto) || !__.MV3 && (() => {
  const seeds = crypto.getRandomValues(new Uint16Array(8));
  // 00001111-2222-M333-N444-555566667777
  return hex4(seeds[0]) + hex4(seeds[1]) + '-' +
    hex4(seeds[2]) + '-' +
    hex4(seeds[3] & 0x0FFF | 0x4000) + '-' + // UUID version 4, M = 4
    hex4(seeds[4] & 0x3FFF | 0x8000) + '-' + // UUID variant 1, N = 8..0xB
    hex4(seeds[5]) + hex4(seeds[6]) + hex4(seeds[7]);
});

const MISSING_PROPS = {
  name: style => `ID: ${style.id}`,
  _id: makeRandomUUID,
  _rev: Date.now,
};

const hasVarsAndImport = ({code}) => code.startsWith(':root {\n  --') && /@import\s/i.test(code);

/**
 * @param {StyleObj} style
 * @param {boolean} [revive]
 * @return {?StyleObj|Promise<StyleObj>}
 */
export function fixKnownProblems(style, revive) {
  let res = 0;
  let v;
  for (const key in MISSING_PROPS) {
    if (!style[key]) {
      style[key] = MISSING_PROPS[key](style);
      res = 1;
    }
  }
  /* delete if value is null, {}, [] */
  for (const key in style) {
    v = style[key];
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
  if (revive && (
    !Array.isArray(v = style.sections) && (v = 0, true) ||
    /* @import must precede `vars` that we add at beginning */
    style[UCD]?.vars && v.some(hasVarsAndImport)
  )) {
    if (!v && !style.sourceCode) {
      style.customName = 'Damaged style #' + style.id;
      style.sections = [{code: '/* No sections or sourceCode */'}];
      return style;
    }
    return usercssMan.buildCode(style);
  }
  return res && style;
}

export function onBeforeSave(style) {
  if (!style.name) {
    throw new Error('Style name is empty');
  }
  if (!style._id) {
    style._id = makeRandomUUID();
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
  const data = dataMap.get(id);
  if (!data) {
    storeInMap(style);
  } else {
    data.style = style;
  }
  if (reason !== false) {
    broadcastStyleUpdated(style, reason, !data);
  } else {
    buildCacheForStyle(style);
  }
  if (reason !== 'sync') {
    syncMan.putDoc(style);
  }
  return style;
}
