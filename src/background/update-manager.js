import compareVersion from '@/js/cmpver';
import {UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {calcStyleDigest, styleSectionsEqual} from '@/js/sections-util';
import {chromeLocal} from '@/js/storage-util';
import {extractUsoaId, isCdnUrl, isLocalhost, rxGF, usoApi} from '@/js/urls';
import {debounce, deepMerge, getHost, sleep} from '@/js/util';
import {ignoreChromeError} from '@/js/util-webext';
import {bgBusy} from './common';
import {db} from './db';
import download from './download';
import * as styleMan from './style-manager';
import * as usercssMan from './usercss-manager';
import {getEmbeddedMeta, toUsercss} from './uso-api';

const STATES = /** @namespace UpdaterStates */ {
  UPDATED: 'updated',
  SKIPPED: 'skipped',
  UNREACHABLE: 'server unreachable',
  // details for SKIPPED status
  EDITED:        'locally edited',
  MAYBE_EDITED:  'may be locally edited',
  SAME_MD5:      'up-to-date: MD5 is unchanged',
  SAME_CODE:     'up-to-date: code sections are unchanged',
  SAME_VERSION:  'up-to-date: version is unchanged',
  ERROR_MD5:     'error: MD5 is invalid',
  ERROR_JSON:    'error: JSON is invalid',
  ERROR_VERSION: 'error: version is older than installed style',
};
export const getStates = () => STATES;
const NOP = () => {};
const safeSleep = __.MV3 ? ms => __.KEEP_ALIVE(sleep(ms)) : sleep;
const RH_ETAG = {responseHeaders: ['etag']}; // a hashsum of file contents
const RX_DATE2VER = new RegExp([
  /^(\d{4})/,
  /(0[1-9]|1(?:0|[12](?=\d\d))?|[2-9])/, // in ambiguous cases like yyyy123 the month will be 1
  /(0[1-9]|[1-2][0-9]?|3[0-1]?|[4-9])/,
  /\.([01][0-9]?|2[0-3]?|[3-9])/,
  /\.([0-5][0-9]?|[6-9])$/,
].map(rx => rx.source).join(''));
const ALARM_NAME = 'scheduledUpdate';
const MIN_INTERVAL_MS = 60e3;
const RETRY_ERRORS = [
  503, // service unavailable
  429, // too many requests
];
const HOST_THROTTLE = 1000; // ms
const hostJobs = {};
let lastUpdateTime;
let checkingAll = false;
let logQueue = [];
let logLastWriteTime = 0;

bgBusy.then(async () => {
  lastUpdateTime = await chromeLocal.getValue('lastUpdateTime') || Date.now();
  prefs.subscribe('updateInterval', schedule, true);
  chrome.alarms.onAlarm.addListener(onAlarm);
});

export async function checkAllStyles({
  save = true,
  ignoreDigest,
  observe,
  onlyEnabled = prefs.__values.updateOnlyEnabled,
} = {}) {
  resetInterval();
  checkingAll = true;
  const port = observe && chrome.runtime.connect({name: 'updater'});
  const styles = styleMan.getAll().filter(s =>
    s.updateUrl &&
    s.updatable !== false &&
    (!onlyEnabled || s.enabled));
  if (port) port.postMessage({count: styles.length});
  log('');
  log(`${save ? 'Scheduled' : 'Manual'} update check for ${styles.length} styles`);
  await Promise.all(
    styles.map(style =>
      checkStyle({style, port, save, ignoreDigest})));
  if (port) port.postMessage({done: true});
  if (port) port.disconnect();
  log('');
  checkingAll = false;
}

/**
 * @param {{
    id?: number,
    style?: StyleObj,
    port?: chrome.runtime.Port,
    save?: boolean,
    ignoreDigest?: boolean,
  }} opts
 * @returns {{
    style: StyleObj,
    updated?: boolean,
    error?: any,
    STATES: UpdaterStates,
   }}

 Original style digests are calculated in these cases:
 * style is installed or updated from server
 * non-usercss style is checked for an update and styleSectionsEqual considers it unchanged

 Update check proceeds in these cases:
 * style has the original digest and it's equal to the current digest
 * [ignoreDigest: true] style doesn't yet have the original digest but we ignore it
 * [ignoreDigest: none/false] style doesn't yet have the original digest
 so we compare the code to the server code and if it's the same we save the digest,
 otherwise we skip the style and report MAYBE_EDITED status

 'ignoreDigest' option is set on the second manual individual update check on the manage page.
 */
export async function checkStyle(opts) {
  let {id} = opts;
  const {
    style = styleMan.get(id),
    ignoreDigest,
    port,
    save,
  } = opts;
  if (!id) id = style.id;
  const {md5Url} = style;
  let {[UCD]: ucd, updateUrl} = style;
  let res, state;
  try {
    await checkIfEdited();
    res = {
      style: await (ucd && !md5Url ? updateUsercss : updateUSO)().then(maybeSave),
      updated: true,
    };
    state = STATES.UPDATED;
  } catch (err) {
    const error = err === 0 && STATES.UNREACHABLE ||
      err && err.message ||
      err;
    res = {error, style, STATES};
    state = `${STATES.SKIPPED} (${Array.isArray(err) ? err[0].message : error})`;
  }
  log(`${state} #${id} ${style.customName || style.name}`);
  if (port) port.postMessage(res);
  return res;

  async function checkIfEdited() {
    if (!ignoreDigest &&
        style.originalDigest &&
        style.originalDigest !== await calcStyleDigest(style)) {
      return Promise.reject(STATES.EDITED);
    }
  }

  async function updateUSO() {
    const md5 = await tryDownload(md5Url);
    if (!md5 || md5.length !== 32) {
      return Promise.reject(STATES.ERROR_MD5);
    }
    if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
      return Promise.reject(STATES.SAME_MD5);
    }
    const usoId = +md5Url.match(/\/(\d+)/)[1];
    let varsUrl = '';
    if (!ucd) {
      ucd = {};
      varsUrl = updateUrl;
    }
    updateUrl = style.updateUrl = `${usoApi}Css/${usoId}`;
    const {result: css} = await tryDownload(updateUrl, {responseType: 'json'});
    const json = await updateUsercss(css)
      || await toUsercss(usoId, varsUrl, css, style, md5, md5Url);
    json.originalMd5 = md5;
    return json;
  }

  async function updateUsercss(css) {
    let oldVer = ucd.version;
    let oldEtag = style.etag;
    let m = (css || extractUsoaId(updateUrl)) &&
      await getEmbeddedMeta(css || style.sourceCode);
    if (m && m.updateUrl) {
      updateUrl = m.updateUrl;
      oldVer = m[UCD].version || '0';
      oldEtag = '';
    } else if (css) {
      return;
    }
    /* Using the more efficient HEAD+GET approach for greasyfork instead of GET+GET,
       because if ETAG header changes it normally means an update so we don't need to
       download meta additionally in a separate request. */
    if ((m = updateUrl.match(rxGF))[5] === 'meta')
      updateUrl = m[1] + 'user' + m[6];
    if (oldEtag && oldEtag === await downloadEtag(updateUrl)) {
      return Promise.reject(STATES.SAME_CODE);
    }
    // TODO: when sourceCode is > 100kB use http range request(s) for version check
    const {headers: {etag}, response} = await tryDownload(updateUrl, RH_ETAG);
    const json = await usercssMan.buildMeta({sourceCode: response, etag, updateUrl});
    const delta = compareVersion(json[UCD].version, oldVer);
    let err;
    if (!delta && !ignoreDigest) {
      // re-install is invalid in a soft upgrade
      err = response === style.sourceCode
        ? STATES.SAME_CODE
        : !isLocalhost(updateUrl) && STATES.SAME_VERSION;
    }
    if (delta < 0) {
      // downgrade is always invalid
      err = STATES.ERROR_VERSION;
    }
    if (err && etag && !style.etag) {
      // first check of ETAG, gonna write it directly to DB as it's too trivial to sync or announce
      style.etag = etag;
      await db.put(style);
    }
    return err
      ? Promise.reject(err)
      : json;
  }

  async function maybeSave(json) {
    json.id = id;
    // keep current state
    delete json.customName;
    delete json.enabled;
    const newStyle = Object.assign({}, style, json);
    newStyle.updateDate = getDateFromVer(newStyle) || Date.now();
    // update digest even if save === false as there might be just a space added etc.
    if (!ucd && styleSectionsEqual(json, style)) {
      style.originalDigest = (await styleMan.install(newStyle)).originalDigest;
      return Promise.reject(STATES.SAME_CODE);
    }
    if (!style.originalDigest && !ignoreDigest) {
      return Promise.reject(STATES.MAYBE_EDITED);
    }
    return !save ? newStyle :
      ucd ? usercssMan.install(newStyle, {dup: style})
        : styleMan.install(newStyle);
  }

}

async function tryDownload(url, params, {retryDelay = HOST_THROTTLE} = {}) {
  while (true) {
    let host, job;
    try {
      params = deepMerge(params || {}, {headers: {'Cache-Control': 'no-cache'}});
      host = getHost(url);
      job = hostJobs[host];
      job = hostJobs[host] = (job
        ? job.catch(NOP).then(() => safeSleep(HOST_THROTTLE / (isCdnUrl(url) ? 4 : 1)))
        : Promise.resolve()
      ).then(() => download(url, params));
      return await job;
    } catch (code) {
      if (!RETRY_ERRORS.includes(code) ||
          retryDelay > MIN_INTERVAL_MS) {
        throw code;
      }
    } finally {
      if (hostJobs[host] === job) delete hostJobs[host];
    }
    retryDelay *= 1.25;
    await safeSleep(retryDelay);
  }
}

async function downloadEtag(url) {
  const req = await tryDownload(url, {method: 'HEAD', ...RH_ETAG});
  return req.headers.etag;
}

function getDateFromVer(style) {
  const m = RX_DATE2VER.exec(style[UCD]?.version);
  if (m) {
    m[2]--; // month is 0-based in `Date` constructor
    return new Date(...m.slice(1)).getTime();
  }
}

function schedule() {
  const interval = prefs.__values.updateInterval * 60 * 60 * 1000;
  if (interval > 0) {
    const elapsed = Math.max(0, Date.now() - lastUpdateTime);
    chrome.alarms.create(ALARM_NAME, {
      when: Date.now() + Math.max(MIN_INTERVAL_MS, interval - elapsed),
    });
  } else {
    chrome.alarms.clear(ALARM_NAME, ignoreChromeError);
  }
}

async function onAlarm({name}) {
  if (name === ALARM_NAME) {
    if (bgBusy) await bgBusy;
    __.KEEP_ALIVE(checkAllStyles());
  }
}

function resetInterval() {
  chromeLocal.set({lastUpdateTime: lastUpdateTime = Date.now()});
  schedule();
}

function log(text) {
  logQueue.push({text, time: new Date().toLocaleString()});
  debounce(flushQueue, text && checkingAll ? 1000 : 0);
}

async function flushQueue(lines) {
  if (!lines) {
    flushQueue(await chromeLocal.getValue('updateLog') || []);
    return;
  }
  const time = Date.now() - logLastWriteTime > 11e3 ?
    logQueue[0].time + ' ' :
    '';
  if (logQueue[0] && !logQueue[0].text) {
    logQueue.shift();
    if (lines[lines.length - 1]) lines.push('');
  }
  lines.splice(0, lines.length - 1000);
  lines.push(time + (logQueue[0] && logQueue[0].text || ''));
  lines.push(...logQueue.slice(1).map(item => item.text));

  chromeLocal.set({updateLog: lines});
  logLastWriteTime = Date.now();
  logQueue = [];
}
