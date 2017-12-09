/* global getStyles, saveStyle, styleSectionsEqual, chromeLocal */
/* global calcStyleDigest */
/* global usercss semverCompare usercssHelper */
'use strict';

// eslint-disable-next-line no-var
var updater = {

  COUNT: 'count',
  UPDATED: 'updated',
  SKIPPED: 'skipped',
  DONE: 'done',

  // details for SKIPPED status
  EDITED: 'locally edited',
  MAYBE_EDITED: 'may be locally edited',
  SAME_MD5: 'up-to-date: MD5 is unchanged',
  SAME_CODE: 'up-to-date: code sections are unchanged',
  SAME_VERSION: 'up-to-date: version is unchanged',
  ERROR_MD5: 'error: MD5 is invalid',
  ERROR_JSON: 'error: JSON is invalid',
  ERROR_VERSION: 'error: version is older than installed style',

  lastUpdateTime: parseInt(localStorage.lastUpdateTime) || Date.now(),

  checkAllStyles({observer = () => {}, save = true, ignoreDigest} = {}) {
    updater.resetInterval();
    updater.checkAllStyles.running = true;
    return getStyles({}).then(styles => {
      styles = styles.filter(style => style.updateUrl);
      observer(updater.COUNT, styles.length);
      updater.log('');
      updater.log(`${save ? 'Scheduled' : 'Manual'} update check for ${styles.length} styles`);
      return Promise.all(
        styles.map(style =>
          updater.checkStyle({style, observer, save, ignoreDigest})));
    }).then(() => {
      observer(updater.DONE);
      updater.log('');
      updater.checkAllStyles.running = false;
    });
  },

  checkStyle({style, observer = () => {}, save = true, ignoreDigest}) {
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
    return Promise.resolve(style)
      .then([calcStyleDigest][!ignoreDigest ? 0 : 'skip'])
      .then([checkIfEdited][!ignoreDigest ? 0 : 'skip'])
      .then([maybeUpdateUSO, maybeUpdateUsercss][style.usercssData ? 1 : 0])
      .then(maybeSave)
      .then(reportSuccess)
      .catch(reportFailure);

    function reportSuccess(saved) {
      observer(updater.UPDATED, saved);
      updater.log(updater.UPDATED + ` #${style.id} ${style.name}`);
    }

    function reportFailure(err) {
      observer(updater.SKIPPED, style, err);
      err = err === 0 ? 'server unreachable' : err;
      updater.log(updater.SKIPPED + ` (${err}) #${style.id} ${style.name}`);
    }

    function checkIfEdited(digest) {
      if (style.originalDigest && style.originalDigest !== digest) {
        return Promise.reject(updater.EDITED);
      }
    }

    function maybeUpdateUSO() {
      return download(style.md5Url).then(md5 => {
        if (!md5 || md5.length !== 32) {
          return Promise.reject(updater.ERROR_MD5);
        }
        if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
          return Promise.reject(updater.SAME_MD5);
        }
        return download(style.updateUrl)
          .then(text => tryJSONparse(text));
      });
    }

    function maybeUpdateUsercss() {
      // TODO: when sourceCode is > 100kB use http range request(s) for version check
      return download(style.updateUrl).then(text => {
        const json = usercss.buildMeta(text);
        const {usercssData: {version}} = style;
        const {usercssData: {version: newVersion}} = json;
        switch (Math.sign(semverCompare(version, newVersion))) {
          case 0:
            // re-install is invalid in a soft upgrade
            if (!ignoreDigest) {
              return Promise.reject(updater.SAME_VERSION);
            } else if (text === style.sourceCode) {
              return Promise.reject(updater.SAME_CODE);
            }
            break;
          case 1:
            // downgrade is always invalid
            return Promise.reject(updater.ERROR_VERSION);
        }
        return usercss.buildCode(json);
      });
    }

    function maybeSave(json = {}) {
      // usercss is already validated while building
      if (!json.usercssData && !styleJSONseemsValid(json)) {
        return Promise.reject(updater.ERROR_JSON);
      }
      json.id = style.id;
      json.updateDate = Date.now();
      json.reason = 'update';
      // keep current state
      delete json.enabled;
      // keep local name customizations
      delete json.name;

      if (styleSectionsEqual(json, style)) {
        // update digest even if save === false as there might be just a space added etc.
        saveStyle(Object.assign(json, {reason: 'update-digest'}));
        return Promise.reject(updater.SAME_CODE);
      } else if (!style.originalDigest && !ignoreDigest) {
        return Promise.reject(updater.MAYBE_EDITED);
      }

      return !save ? json :
        json.usercssData
          ? usercssHelper.save(json)
          : saveStyle(json);
    }

    function styleJSONseemsValid(json) {
      return json
        && json.sections
        && json.sections.length
        && typeof json.sections.every === 'function'
        && typeof json.sections[0].code === 'string';
    }
  },

  schedule() {
    const interval = prefs.get('updateInterval') * 60 * 60 * 1000;
    if (interval) {
      const elapsed = Math.max(0, Date.now() - updater.lastUpdateTime);
      debounce(updater.checkAllStyles, Math.max(10e3, interval - elapsed));
    } else {
      debounce.unregister(updater.checkAllStyles);
    }
  },

  resetInterval() {
    localStorage.lastUpdateTime = updater.lastUpdateTime = Date.now();
    updater.schedule();
  },

  log: (() => {
    let queue = [];
    let lastWriteTime = 0;
    return text => {
      queue.push({text, time: new Date().toLocaleString()});
      debounce(flushQueue, text && updater.checkAllStyles.running ? 1000 : 0);
    };
    function flushQueue() {
      chromeLocal.getValue('updateLog').then((lines = []) => {
        const time = Date.now() - lastWriteTime > 11e3 ? queue[0].time + ' ' : '';
        if (!queue[0].text) {
          queue.shift();
          if (lines[lines.length - 1]) {
            lines.push('');
          }
        }
        lines.splice(0, lines.length - 1000);
        lines.push(time + queue[0].text);
        lines.push(...queue.slice(1).map(item => item.text));
        chromeLocal.setValue('updateLog', lines);
        lastWriteTime = Date.now();
        queue = [];
      });
    }
  })(),
};

updater.schedule();
prefs.subscribe(['updateInterval'], updater.schedule);
