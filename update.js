/* globals getStyles, saveStyle, styleSectionsEqual */
'use strict';

// eslint-disable-next-line no-var
var updater = {

  COUNT: 'count',
  UPDATED: 'updated',
  SKIPPED: 'skipped',
  SKIPPED_SAME_MD5: 'up-to-date: MD5 is unchanged',
  SKIPPED_SAME_CODE: 'up-to-date: code sections are unchanged',
  SKIPPED_ERROR_MD5: 'error: MD5 is invalid',
  SKIPPED_ERROR_JSON: 'error: JSON is invalid',
  DONE: 'done',

  lastUpdateTime: parseInt(localStorage.lastUpdateTime) || Date.now(),

  checkAllStyles(observe = () => {}) {
    updater.resetInterval();
    return new Promise(resolve => {
      getStyles({}, styles => {
        styles = styles.filter(style => style.updateUrl);
        observe(updater.COUNT, styles.length);
        Promise.all(styles.map(style =>
          updater.checkStyle(style)
            .then(saveStyle)
            .then(saved => observe(updater.UPDATED, saved))
            .catch(err => observe(updater.SKIPPED, style, err))
        )).then(() => {
          observe(updater.DONE);
          resolve();
        });
      });
    });
  },

  checkStyle(style) {
    return download(style.md5Url)
      .then(md5 =>
        !md5 || md5.length != 32 ? Promise.reject(updater.SKIPPED_ERROR_MD5) :
        md5 == style.originalMd5 ? Promise.reject(updater.SKIPPED_SAME_MD5) :
        style.updateUrl)
      .then(download)
      .then(text => tryJSONparse(text))
      .then(json =>
        !updater.styleJSONseemsValid(json) ? Promise.reject(updater.SKIPPED_ERROR_JSON) :
        styleSectionsEqual(json, style) ? Promise.reject(updater.SKIPPED_SAME_CODE) :
        // keep the local name as it could've been customized by the user
        Object.assign(json, {
          id: style.id,
          name: null,
        }));
  },

  styleJSONseemsValid(json) {
    return json
      && json.sections
      && json.sections.length
      && typeof json.sections.every == 'function'
      && typeof json.sections[0].code == 'string';
  },

  schedule() {
    const interval = prefs.get('updateInterval') * 60 * 60 * 1000;
    if (interval) {
      const elapsed = Math.max(0, Date.now() - updater.lastUpdateTime);
      debounce(updater.checkAllStyles, Math.max(10e3, interval - elapsed));
    } else if (debounce.timers) {
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
