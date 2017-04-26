/* global getStyles, saveStyle, styleSectionsEqual, chromeLocal */
/* global getStyleDigests, updateStyleDigest */
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
  ERROR_MD5: 'error: MD5 is invalid',
  ERROR_JSON: 'error: JSON is invalid',

  lastUpdateTime: parseInt(localStorage.lastUpdateTime) || Date.now(),

  checkAllStyles({observer = () => {}, save = true, ignoreDigest} = {}) {
    updater.resetInterval();
    return getStyles({}).then(styles => {
      styles = styles.filter(style => style.updateUrl);
      observer(updater.COUNT, styles.length);
      updater.log(`${save ? 'Scheduled' : 'Manual'} update check for ${styles.length} styles`);
      return Promise.all(
        styles.map(style =>
          updater.checkStyle({style, observer, save, ignoreDigest})));
    }).then(() => {
      observer(updater.DONE);
      updater.log('');
    });
  },

  checkStyle({style, observer = () => {}, save = true, ignoreDigest}) {
    let hasDigest;
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
    return getStyleDigests(style)
      .then(fetchMd5IfNotEdited)
      .then(fetchCodeIfMd5Changed)
      .then(saveIfUpdated)
      .then(saved => {
        observer(updater.UPDATED, saved);
        updater.log(updater.UPDATED + ` #${saved.id} ${saved.name}`);
      })
      .catch(err => {
        observer(updater.SKIPPED, style, err);
        err = err === 0 ? 'server unreachable' : err;
        updater.log(updater.SKIPPED + ` (${err}) #${style.id} ${style.name}`);
      });

    function fetchMd5IfNotEdited([originalDigest, current]) {
      hasDigest = Boolean(originalDigest);
      if (hasDigest && !ignoreDigest && originalDigest != current) {
        return Promise.reject(updater.EDITED);
      }
      return download(style.md5Url);
    }

    function fetchCodeIfMd5Changed(md5) {
      if (!md5 || md5.length != 32) {
        return Promise.reject(updater.ERROR_MD5);
      }
      if (md5 == style.originalMd5 && hasDigest && !ignoreDigest) {
        return Promise.reject(updater.SAME_MD5);
      }
      return download(style.updateUrl);
    }

    function saveIfUpdated(text) {
      const json = tryJSONparse(text);
      if (!styleJSONseemsValid(json)) {
        return Promise.reject(updater.ERROR_JSON);
      }
      json.id = style.id;
      if (styleSectionsEqual(json, style)) {
        // JSONs may have different order of items even if sections are effectively equal
        // so we'll update the digest anyway
        updateStyleDigest(json);
        return Promise.reject(updater.SAME_CODE);
      } else if (!hasDigest && !ignoreDigest) {
        return Promise.reject(updater.MAYBE_EDITED);
      }
      return !save ? json :
        saveStyle(Object.assign(json, {
          name: null, // keep local name customizations
          reason: 'update',
        }));
    }

    function styleJSONseemsValid(json) {
      return json
        && json.sections
        && json.sections.length
        && typeof json.sections.every == 'function'
        && typeof json.sections[0].code == 'string';
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

  log(text) {
    chromeLocal.getValue('updateLog').then((lines = []) => {
      const time = text && performance.now() - (updater.log.lastWriteTime || 0) > 10e3
        ? new Date().toLocaleString() + '\t'
        : '';
      lines.splice(0, lines.length - 1000);
      lines.push(time + text);
      chromeLocal.setValue('updateLog', lines);
      updater.log.lastWriteTime = performance.now();
    });
  },
};

updater.schedule();
prefs.subscribe(updater.schedule, ['updateInterval']);
