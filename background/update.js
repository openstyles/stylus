/* global styleSectionsEqual prefs download tryJSONparse ignoreChromeError
  calcStyleDigest getStyleWithNoCode debounce chromeLocal
  usercss semverCompare styleJSONseemsValid
  API_METHODS styleManager */
'use strict';

(() => {

  const STATES = {
    UPDATED: 'updated',
    SKIPPED: 'skipped',

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

  const ALARM_NAME = 'scheduledUpdate';
  const MIN_INTERVAL_MS = 60e3;

  let lastUpdateTime = parseInt(localStorage.lastUpdateTime) || Date.now();
  let checkingAll = false;
  let logQueue = [];
  let logLastWriteTime = 0;

  const retrying = new Set();

  API_METHODS.updateCheckAll = checkAllStyles;
  API_METHODS.updateCheck = checkStyle;
  API_METHODS.getUpdaterStates = () => STATES;

  prefs.subscribe(['updateInterval'], schedule);
  schedule();
  chrome.alarms.onAlarm.addListener(onAlarm);

  return {checkAllStyles, checkStyle, STATES};

  function checkAllStyles({
    save = true,
    ignoreDigest,
    observe,
  } = {}) {
    resetInterval();
    checkingAll = true;
    retrying.clear();
    const port = observe && chrome.runtime.connect({name: 'updater'});
    return styleManager.getAllStyles().then(styles => {
      styles = styles.filter(style => style.updateUrl);
      if (port) port.postMessage({count: styles.length});
      log('');
      log(`${save ? 'Scheduled' : 'Manual'} update check for ${styles.length} styles`);
      return Promise.all(
        styles.map(style =>
          checkStyle({style, port, save, ignoreDigest})));
    }).then(() => {
      if (port) port.postMessage({done: true});
      if (port) port.disconnect();
      log('');
      checkingAll = false;
      retrying.clear();
    });
  }

  function checkStyle({
    id,
    style,
    port,
    save = true,
    ignoreDigest,
  }) {
    /*
    Original style digests are calculated in these cases:
    * style is installed or updated from server
    * style is checked for an update and its code is equal to the server code

    Update check proceeds in these cases:
    * style has the original digest and it's equal to the current digest
    * [ignoreDigest: true] style doesn't yet have the original digest but we ignore it
    * [ignoreDigest: none/false] style doesn't yet have the original digest
      so we compare the code to the server code and if it's the same we save the digest,
      otherwise we skip the style and report MAYBE_EDITED status

    'ignoreDigest' option is set on the second manual individual update check on the manage page.
    */
    return fetchStyle()
      .then(() => {
        if (!ignoreDigest) {
          return calcStyleDigest(style)
            .then(checkIfEdited);
        }
      })
      .then(() => {
        if (style.usercssData) {
          return maybeUpdateUsercss();
        }
        return maybeUpdateUSO();
      })
      .then(maybeSave)
      .then(reportSuccess)
      .catch(reportFailure);

    function fetchStyle() {
      if (style) {
        return Promise.resolve();
      }
      return styleManager.get(id)
        .then(style_ => {
          style = style_;
        });
    }

    function reportSuccess(saved) {
      log(STATES.UPDATED + ` #${style.id} ${style.name}`);
      const info = {updated: true, style: saved};
      if (port) port.postMessage(info);
      return info;
    }

    function reportFailure(error) {
      if ((
        error === 503 || // Service Unavailable
        error === 429    // Too Many Requests
      ) && !retrying.has(id)) {
        retrying.add(id);
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(checkStyle({id, style, port, save, ignoreDigest}));
          }, 1000);
        });
      }
      error = error === 0 ? 'server unreachable' : error;
      // UserCSS metadata error returns an object; e.g. "Invalid @var color..."
      if (typeof error === 'object' && error.message) {
        error = error.message;
      }
      log(STATES.SKIPPED + ` (${error}) #${style.id} ${style.name}`);
      const info = {error, STATES, style: getStyleWithNoCode(style)};
      if (port) port.postMessage(info);
      return info;
    }

    function checkIfEdited(digest) {
      if (style.originalDigest && style.originalDigest !== digest) {
        return Promise.reject(STATES.EDITED);
      }
    }

    function maybeUpdateUSO() {
      return download(style.md5Url).then(md5 => {
        if (!md5 || md5.length !== 32) {
          return Promise.reject(STATES.ERROR_MD5);
        }
        if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
          return Promise.reject(STATES.SAME_MD5);
        }
        // USO can't handle POST requests for style json
        return download(style.updateUrl, {body: null})
          .then(text => {
            const style = tryJSONparse(text);
            if (style) {
              // USO may not provide a correctly updated originalMd5 (#555)
              style.originalMd5 = md5;
            }
            return style;
          });
      });
    }

    function maybeUpdateUsercss() {
      // TODO: when sourceCode is > 100kB use http range request(s) for version check
      return download(style.updateUrl).then(text =>
        usercss.buildMeta(text).then(json => {
          const {usercssData: {version}} = style;
          const {usercssData: {version: newVersion}} = json;
          switch (Math.sign(semverCompare(version, newVersion))) {
            case 0:
              // re-install is invalid in a soft upgrade
              if (!ignoreDigest) {
                const sameCode = text === style.sourceCode;
                return Promise.reject(sameCode ? STATES.SAME_CODE : STATES.SAME_VERSION);
              }
              break;
            case 1:
              // downgrade is always invalid
              return Promise.reject(STATES.ERROR_VERSION);
          }
          return usercss.buildCode(json);
        })
      );
    }

    function maybeSave(json = {}) {
      // usercss is already validated while building
      if (!json.usercssData && !styleJSONseemsValid(json)) {
        return Promise.reject(STATES.ERROR_JSON);
      }

      json.id = style.id;
      json.updateDate = Date.now();

      // keep current state
      delete json.enabled;

      // keep local name customizations
      if (style.originalName !== style.name && style.name !== json.name) {
        delete json.name;
      } else {
        json.originalName = json.name;
      }

      const newStyle = Object.assign({}, style, json);
      if (styleSectionsEqual(json, style, {checkSource: true})) {
        // update digest even if save === false as there might be just a space added etc.
        return styleManager.installStyle(newStyle)
          .then(saved => {
            style.originalDigest = saved.originalDigest;
            return Promise.reject(STATES.SAME_CODE);
          });
      }

      if (!style.originalDigest && !ignoreDigest) {
        return Promise.reject(STATES.MAYBE_EDITED);
      }

      return save ?
        API_METHODS[json.usercssData ? 'installUsercss' : 'installStyle'](newStyle) :
        newStyle;
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
    localStorage.lastUpdateTime = lastUpdateTime = Date.now();
    schedule();
  }

  function log(text) {
    logQueue.push({text, time: new Date().toLocaleString()});
    debounce(flushQueue, text && checkingAll ? 1000 : 0);
  }

  function flushQueue(lines) {
    if (!lines) {
      chromeLocal.getValue('updateLog', []).then(flushQueue);
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
