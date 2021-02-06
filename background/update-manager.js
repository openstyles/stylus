/* global API */// msg.js
/* global RX_META URLS debounce download ignoreChromeError */// toolbox.js
/* global calcStyleDigest styleJSONseemsValid styleSectionsEqual */ // sections-util.js
/* global chromeLocal */// storage-util.js
/* global db */
/* global prefs */
'use strict';

/* exported updateMan */
const updateMan = (() => {
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
  const RH_ETAG = {responseHeaders: ['etag']}; // a hashsum of file contents
  const RX_DATE2VER = new RegExp([
    /^(\d{4})/,
    /(1(?:0|[12](?=\d\d))?|[2-9])/, // in ambiguous cases like yyyy123 the month will be 1
    /([1-2][0-9]?|3[0-1]?|[4-9])/,
    /\.(0|1[0-9]?|2[0-3]?|[3-9])/,
    /\.(0|[1-5][0-9]?|[6-9])$/,
  ].map(rx => rx.source).join(''));
  const ALARM_NAME = 'scheduledUpdate';
  const MIN_INTERVAL_MS = 60e3;
  const RETRY_ERRORS = [
    503, // service unavailable
    429, // too many requests
  ];
  let lastUpdateTime;
  let checkingAll = false;
  let logQueue = [];
  let logLastWriteTime = 0;

  chromeLocal.getValue('lastUpdateTime').then(val => {
    lastUpdateTime = val || Date.now();
    prefs.subscribe('updateInterval', schedule, {runNow: true});
    chrome.alarms.onAlarm.addListener(onAlarm);
  });

  return {
    checkAllStyles,
    checkStyle,
    getStates: () => STATES,
  };

  async function checkAllStyles({
    save = true,
    ignoreDigest,
    observe,
  } = {}) {
    resetInterval();
    checkingAll = true;
    const port = observe && chrome.runtime.connect({name: 'updater'});
    const styles = (await API.styles.getAll())
      .filter(style => style.updateUrl);
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
      id?: number
      style?: StyleObj
      port?: chrome.runtime.Port
      save?: boolean = true
      ignoreDigest?: boolean
    }} opts
   * @returns {{
      style: StyleObj
      updated?: boolean
      error?: any
      STATES: UpdaterStates
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
  async function checkStyle(opts) {
    let {id} = opts;
    const {
      style = await API.styles.get(id),
      ignoreDigest,
      port,
      save,
    } = opts;
    if (!id) id = style.id;
    const ucd = style.usercssData;
    let res, state;
    try {
      await checkIfEdited();
      res = {
        style: await (ucd ? updateUsercss : updateUSO)().then(maybeSave),
        updated: true,
      };
      state = STATES.UPDATED;
    } catch (err) {
      const error = err === 0 && STATES.UNREACHABLE ||
        err && err.message ||
        err;
      res = {error, style, STATES};
      state = `${STATES.SKIPPED} (${error})`;
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
      const url = URLS.makeUsoArchiveCodeUrl(style.md5Url.match(/\d+/)[0]);
      const req = await tryDownload(url, RH_ETAG).catch(() => null);
      if (req) {
        return updateToUSOArchive(url, req);
      }
      const md5 = await tryDownload(style.md5Url);
      if (!md5 || md5.length !== 32) {
        return Promise.reject(STATES.ERROR_MD5);
      }
      if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
        return Promise.reject(STATES.SAME_MD5);
      }
      const json = await tryDownload(style.updateUrl, {responseType: 'json'});
      if (!styleJSONseemsValid(json)) {
        return Promise.reject(STATES.ERROR_JSON);
      }
      // USO may not provide a correctly updated originalMd5 (#555)
      json.originalMd5 = md5;
      return json;
    }

    async function updateToUSOArchive(url, req) {
      // UserCSS metadata may be embedded in the original USO style so let's use its updateURL
      const [meta2] = req.response.replace(RX_META, '').match(RX_META) || [];
      if (meta2 && meta2.includes('@updateURL')) {
        const {updateUrl} = await API.usercss.buildMeta({sourceCode: meta2}).catch(() => ({}));
        if (updateUrl) {
          url = updateUrl;
          req = await tryDownload(url, RH_ETAG);
        }
      }
      const json = await API.usercss.buildMeta({
        id,
        etag: req.headers.etag,
        md5Url: null,
        originalMd5: null,
        sourceCode: req.response,
        updateUrl: url,
        url: URLS.extractUsoArchiveInstallUrl(url),
      });
      const varUrlValues = style.updateUrl.split('?')[1];
      const varData = json.usercssData.vars;
      if (varUrlValues && varData) {
        const IK = 'ik-';
        const IK_LEN = IK.length;
        for (let [key, val] of new URLSearchParams(varUrlValues)) {
          if (!key.startsWith(IK)) continue;
          key = key.slice(IK_LEN);
          const varDef = varData[key];
          if (!varDef) continue;
          if (varDef.options) {
            let sel = val.startsWith(IK) && getVarOptByName(varDef, val.slice(IK_LEN));
            if (!sel) {
              key += '-custom';
              sel = getVarOptByName(varDef, key + '-dropdown');
              if (sel) varData[key].value = val;
            }
            if (sel) varDef.value = sel.name;
          } else {
            varDef.value = val;
          }
        }
      }
      return API.usercss.buildCode(json);
    }

    async function updateUsercss() {
      if (style.etag && style.etag === await downloadEtag()) {
        return Promise.reject(STATES.SAME_CODE);
      }
      // TODO: when sourceCode is > 100kB use http range request(s) for version check
      const {headers: {etag}, response} = await tryDownload(style.updateUrl, RH_ETAG);
      /* There's a bug? in Chrome which occurs only in a packaged crx:
       * DOM script for semver fires 'load' event before the script actually runs.
       * Since the conditions for the bug are rare we'll simply load in parallel */
      const [json] = await Promise.all([
        API.usercss.buildMeta({sourceCode: response, etag}),
        require(['/vendor/semver-bundle/semver']), /* global semverCompare */
      ]);
      const delta = semverCompare(json.usercssData.version, ucd.version);
      let err;
      if (!delta && !ignoreDigest) {
        // re-install is invalid in a soft upgrade
        err = response === style.sourceCode ? STATES.SAME_CODE : STATES.SAME_VERSION;
      }
      if (delta < 0) {
        // downgrade is always invalid
        err = STATES.ERROR_VERSION;
      }
      if (err && etag && !style.etag) {
        // first check of ETAG, gonna write it directly to DB as it's too trivial to sync or announce
        style.etag = etag;
        await db.exec('put', style);
      }
      return err
        ? Promise.reject(err)
        : API.usercss.buildCode(json);
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
        style.originalDigest = (await API.styles.install(newStyle)).originalDigest;
        return Promise.reject(STATES.SAME_CODE);
      }
      if (!style.originalDigest && !ignoreDigest) {
        return Promise.reject(STATES.MAYBE_EDITED);
      }
      return !save ? newStyle :
        (ucd ? API.usercss.install : API.styles.install)(newStyle);
    }

    async function tryDownload(url, params) {
      let {retryDelay = 1000} = opts;
      while (true) {
        try {
          return await download(url, params);
        } catch (code) {
          if (!RETRY_ERRORS.includes(code) ||
              retryDelay > MIN_INTERVAL_MS) {
            return Promise.reject(code);
          }
        }
        retryDelay *= 1.25;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    async function downloadEtag() {
      const opts = Object.assign({method: 'head'}, RH_ETAG);
      const req = await tryDownload(style.updateUrl, opts);
      return req.headers.etag;
    }

    function getDateFromVer(style) {
      const m = style.updateUrl.startsWith(URLS.usoArchiveRaw) &&
        style.usercssData.version.match(RX_DATE2VER);
      if (m) {
        m[2]--; // month is 0-based in `Date` constructor
        return new Date(...m.slice(1)).getTime();
      }
    }

    function getVarOptByName(varDef, name) {
      return varDef.options.find(o => o.name === name);
    }
  }

  function schedule() {
    const interval = prefs.get('updateInterval') * 60 * 60 * 1000;
    if (interval > 0) {
      const elapsed = Math.max(0, Date.now() - lastUpdateTime);
      chrome.alarms.create(ALARM_NAME, {
        when: Date.now() + Math.max(MIN_INTERVAL_MS, interval - elapsed),
      });
    } else {
      chrome.alarms.clear(ALARM_NAME, ignoreChromeError);
    }
  }

  function onAlarm({name}) {
    if (name === ALARM_NAME) checkAllStyles();
  }

  function resetInterval() {
    chromeLocal.setValue('lastUpdateTime', lastUpdateTime = Date.now());
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

    chromeLocal.setValue('updateLog', lines);
    logLastWriteTime = Date.now();
    logQueue = [];
  }
})();
