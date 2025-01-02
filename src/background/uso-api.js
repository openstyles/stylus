import {UCD} from '@/js/consts';
import * as URLS from '@/js/urls';
import {fetchText, RX_META} from '@/js/util';
import download from './download';
import * as styleMan from './style-manager';
import * as usercssMan from './usercss-manager';

const pingers = {};
const getMd5Url = usoId => `https://update.userstyles.org/${usoId}.md5`;

export function deleteStyle(usoId) {
  const style = findStyle(usoId);
  return style ? styleMan.remove(style.id) : false;
}

/** UserCSS metadata may be embedded in the original USO style so let's use its updateURL */
export function getEmbeddedMeta(code) {
  const isRaw = arguments[0];
  const m = code.includes('@updateURL')
    && (isRaw ? code : code.replace(RX_META, '')).match(RX_META);
  return m && usercssMan.buildMeta({sourceCode: m[0]}).catch(() => null);
}

export async function getUpdatability(usoId, asObject) {
  const md5Url = getMd5Url(usoId);
  const md5 = await fetchText(md5Url);
  const dup = await findStyle(usoId, md5Url);
  // see STATE_EVENTS in install-hook-userstyles.js
  const state = !dup ? 0 : dup[UCD] || dup.originalMd5 === md5 ? 2 : 1;
  return asObject
    ? {dup, md5, md5Url, state}
    : state;
}

export function pingback(usoId, delay) {
  clearTimeout(pingers[usoId]);
  delete pingers[usoId];
  if (delay > 0) {
    return __.KEEP_ALIVE(new Promise(resolve => (
      pingers[usoId] = setTimeout(ping, delay, usoId, resolve)
    )));
  }
  if (delay !== false) {
    return ping(usoId);
  }
}

/**
 * Replicating USO-Archive format
 */
export async function toUsercss(usoId, varsUrl, css, dup, md5, md5Url) {
  let v;
  if (!dup) dup = false; // "polyfilling" for dup?.prop
  const {updateUrl = URLS.makeUpdateUrl('usoa', usoId)} = dup;
  const jobs = [
    !dup && getUpdatability(usoId, true).then(res => ({dup, md5, md5Url} = res)),
    !css && download(updateUrl).then(res => (css = res)),
  ].filter(Boolean);
  if (jobs[0]) await Promise.all(jobs);
  const varMap = {};
  const {style} = await usercssMan.build({sourceCode: css, metaOnly: true});
  const vars = (v = varsUrl || dup.updateUrl) && useVars(style, v, varMap);
  if (dup) {
    return style;
  }
  style.md5Url = md5Url;
  style.originalMd5 = md5;
  style.updateUrl = updateUrl;
  await usercssMan.install(style, {dup, vars});
}

function useVars(style, src, cfg) {
  src = typeof src === 'string'
    ? new URLSearchParams(src.split('?')[1])
    : Object.entries(src);
  const {vars} = style[UCD];
  if (!vars) {
    return;
  }
  for (let [key, val] of src) {
    if (!key.startsWith('ik-')) continue;
    key = makeKey(key.slice(3), cfg);
    const v = vars[key];
    if (!v) continue;
    if (v.options) {
      let sel = val.startsWith('ik-') && optByName(v, makeKey(val.slice(3), cfg));
      if (!sel) {
        key += '-custom';
        sel = optByName(v, key + '-dropdown');
        if (sel) vars[key].value = val;
      }
      if (sel) v.value = sel.name;
    } else {
      v.value = val;
    }
  }
  return style;
}

function findStyle(usoId, md5Url = getMd5Url(usoId)) {
  return styleMan.find({md5Url})
    || styleMan.find({installationUrl: URLS.makeInstallUrl('usoa', usoId)});
}

async function ping(id, resolve) {
  await fetch(`${URLS.uso}styles/install/${id}?source=stylish-ch`);
  if (resolve) resolve(true);
  return true;
}

function makeKey(key, varMap) {
  let res = varMap[key];
  if (!res && key !== (res = key.replace(/[^-\w]/g, '-'))) {
    while (res in varMap) res += '-';
    varMap[key] = res;
  }
  return res;
}

function optByName(v, name) {
  return v.options.find(o => o.name === name);
}
