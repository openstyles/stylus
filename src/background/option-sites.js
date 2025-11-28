import {pDisableAll, pExposeIframes, pPatchCsp, pStyleViaASS, pStyleViaXhr} from '@/js/consts';
import {__values, subscribe} from '@/js/prefs';
import {globAsRegExpStr, tryRegExp} from '@/js/util';

const kSites = '.sites';
const kSitesOnly = '.sitesOnly';
const OPT_IDS = [pExposeIframes, pPatchCsp, pStyleViaASS, pStyleViaXhr];
/** Since space isn't allowed in values, it marks our regex logic so it can be restored
 * in one replace() call on the result instead of escaping each value individually */
const ALL_RE = ' [-a-z ] +://';
//               0:  1:*   2:- 3:scheme                   4:host             5:path
const SITE_RE = /^(?:(\*)$|(-)?((?:(?:ht|f)tps?|\*):\/\/)?([-\w.*]+(?::\d+)?)(\/[^\s#]*)?)/i;
/** @typedef {{on?: string|RegExp, off?: string|RegExp, str: string}} OptionSitesData */
/** @type {{[key: string]: false | OptionSitesData}} */
export const optionSites = {};
/** @param {OptionSitesData}
 * @param {string} url */
export const isOptionSite = ({on, off}, url) =>
  (on === true || !!on?.test(url)) && !off?.test(url);
let pending;

subscribe([
  pDisableAll,
  ...OPT_IDS.join(',').replace(/[^,]+/g, `$&,$&${kSites},$&${kSitesOnly}`).split(','),
], onPref, true);

function onPref(key) {
  if (key) {
    pending ??= Promise.resolve().then(onPref);
  } else {
    pending = null;
    if (!__values[pDisableAll])
      update();
  }
}

function update() {
  // TODO: register a content script for styleViaXhr?
  for (const id of OPT_IDS) {
    if (!__values[id])
      continue;
    if (!__values[id + kSitesOnly]) {
      optionSites[id] = false;
      continue;
    }
    const arr = __values[id + kSites].trim().toLowerCase().split(/\s+/).sort();
    const str = arr.join('\n');
    if (str === optionSites[id]?.str)
      continue;
    const data = optionSites[id] = /** @type {OptionSitesData} */ {};
    const seen = new Set();
    const regexps = {};
    let hasAll;
    for (let m of arr) {
      const not = m.charCodeAt(0) === 45/* - */;
      const re = m.charCodeAt(not) === 47/* / */ && m.charCodeAt(m.length - 1) === 47
        && m.slice(1 + not, -1);
      m = re ? [re] : SITE_RE.exec(str);
      if (!m || seen.has(m[0]))
        continue;
      seen.add(m[0]);
      if (m[1]) {
        hasAll = data.on = true;
      } else if (not || !hasAll) {
        const type = not ? 'off' : 'on';
        data[type] ??= [];
        if (re) {
          (regexps[type] ??= []).push(re);
        } else {
          data[type].push([
            // API reports scheme and host in lowercase
            (m[3] || ALL_RE).toLowerCase(),
            m[4].replace('*.', ' ( ?: [ ^:/ ] + \\ . ) ?').toLowerCase() + (m[5] || '/*'),
          ]);
        }
      }
    }
    for (const [k, globs] of Object.entries(data)) {
      if (globs === true)
        continue;
      let res;
      if (globs.length) {
        res = ['']; // reserving first elem to modify it for `multiSchemes`
        let cur, curScheme, multiSchemes;
        for (const [scheme, hostPath] of globs) {
          if (!cur) { // first iteration
            res.push(scheme);
            curScheme = scheme;
            cur = hostPath;
          } else if (curScheme !== scheme) {
            if (cur) res.push(cur, ' |', scheme); // just one site in previous run
            else res.push(' ) |', scheme);
            multiSchemes = true;
            curScheme = scheme;
            cur = hostPath;
          } else if (cur) {
            res.push(' ( ?:', cur, ' |', hostPath);
            cur = null;
          } else {
            res.push(' |', hostPath);
          }
        }
        cur = (cur || curScheme && ' )' || '') + (multiSchemes ? ' )' : '');
        if (cur) res.push(cur);
        res[0] = multiSchemes ? ' ^ ( ?:' : ' ^';
        res = globAsRegExpStr(res.join('')).replace(/ \\/g, '');
      }
      // TODO: show the error in the options
      data[k] = tryRegExp(
        (res || '') +
        (regexps[k] ? `${res ? '|' : ''}^(?:${regexps[k].join('|')})$` : '')
      );
      data.str = str;
    }
  }
}
