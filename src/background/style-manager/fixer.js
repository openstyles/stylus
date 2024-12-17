import {UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as URLS from '@/js/urls';
import {isEmptyObj} from '@/js/util';
import {makeRandomUUID} from './util';

const MISSING_PROPS = {
  name: style => `ID: ${style.id}`,
  _id: () => makeRandomUUID(),
  _rev: () => Date.now(),
};

const hasVarsAndImport = ({code}) => code.startsWith(':root {\n  --') && /@import\s/i.test(code);

export function fixKnownProblems(style, initIndex, initArray) {
  if (!style || !style.id) style = {id: Date.now()};
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
  if (initArray && (
    !Array.isArray(v = style.sections) && (v = 0, true) ||
    /* @import must precede `vars` that we add at beginning */
    !isEmptyObj(style[UCD]?.vars) && v.some(hasVarsAndImport)
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
