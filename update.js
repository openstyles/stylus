/* globals getStyles, saveStyle, styleSectionsEqual, getStyleDigests, updateStyleDigest */
'use strict';

// eslint-disable-next-line no-var
var updater = {

  COUNT: 'count',
  UPDATED: 'updated',
  SKIPPED: 'skipped',
  SKIPPED_EDITED: 'locally edited',
  SKIPPED_MAYBE_EDITED: 'maybe locally edited',
  SKIPPED_SAME_MD5: 'up-to-date: MD5 is unchanged',
  SKIPPED_SAME_CODE: 'up-to-date: code sections are unchanged',
  SKIPPED_ERROR_MD5: 'error: MD5 is invalid',
  SKIPPED_ERROR_JSON: 'error: JSON is invalid',
  DONE: 'done',

  lastUpdateTime: parseInt(localStorage.lastUpdateTime) || Date.now(),

  checkAllStyles(observe = () => {}, {save = true} = {}) {
    updater.resetInterval();
    return new Promise(resolve => {
      getStyles({}, styles => {
        styles = styles.filter(style => style.updateUrl);
        observe(updater.COUNT, styles.length);
        Promise.all(styles.map(style =>
          updater.checkStyle(style, observe, {save})
        )).then(() => {
          observe(updater.DONE);
          resolve();
        });
      });
    });
  },

  checkStyle(style, observe = () => {}, {save = true} = {}) {
    let hasDigest;
    return getStyleDigests(style)
      .then(fetchMd5IfNotEdited)
      .then(fetchCodeIfMd5Changed)
      .then(saveIfUpdated)
      .then(saved => observe(updater.UPDATED, saved))
      .catch(err => observe(updater.SKIPPED, style, err));

    function fetchMd5IfNotEdited([originalDigest, current]) {
      hasDigest = Boolean(originalDigest);
      if (hasDigest && originalDigest != current) {
        return Promise.reject(updater.SKIPPED_EDITED);
      }
      return download(style.md5Url);
    }

    function fetchCodeIfMd5Changed(md5) {
      if (!md5 || md5.length != 32) {
        return Promise.reject(updater.SKIPPED_ERROR_MD5);
      }
      if (md5 == style.originalMd5 && hasDigest) {
        return Promise.reject(updater.SKIPPED_SAME_MD5);
      }
      return download(style.updateUrl);
    }

    function saveIfUpdated(text) {
      const json = tryJSONparse(text);
      if (!styleJSONseemsValid(json)) {
        return Promise.reject(updater.SKIPPED_ERROR_JSON);
      }
      json.id = style.id;
      if (styleSectionsEqual(json, style)) {
        if (!hasDigest) {
          updateStyleDigest(json);
        }
        return Promise.reject(updater.SKIPPED_SAME_CODE);
      } else if (!hasDigest) {
        return Promise.reject(updater.SKIPPED_MAYBE_EDITED);
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
};

updater.schedule();
prefs.subscribe(updater.schedule, ['updateInterval']);
