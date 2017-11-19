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
    const maybeUpdate = style.usercssData ? maybeUpdateUsercss :
      style.freestylerData ? maybeUpdateFWS :
      maybeUpdateUSO;
    return (ignoreDigest ? Promise.resolve() : calcStyleDigest(style))
      .then(checkIfEdited)
      .then(maybeUpdate)
      .then(maybeValidate)
      .then(maybeSave)
      .then(saved => {
        observer(updater.UPDATED, saved);
        updater.log(updater.UPDATED + ` #${saved.id} ${saved.name}`);
      })
      .catch(err => {
        observer(updater.SKIPPED, style, err);
        err = err === 0 ? 'server unreachable' : err;
        updater.log(updater.SKIPPED + ` (${err}) #${style.id} ${style.name}`);
      });

    function checkIfEdited(digest) {
      if (ignoreDigest) {
        return;
      }
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
      return download(style.updateUrl).then(text => {
        const json = usercss.buildMeta(text);
        const {usercssData: {version}} = style;
        const {usercssData: {version: newVersion}} = json;
        switch (Math.sign(semverCompare(version, newVersion))) {
          case 0:
            // re-install is invalid in a soft upgrade
            if (!ignoreDigest) {
              return Promise.reject(updater.SAME_VERSION);
            }
            break;
          case 1:
            // downgrade is always invalid
            return Promise.reject(updater.ERROR_VERSION);
        }
        return usercss.buildCode(json);
      });
    }

    function maybeUpdateFWS() {
      return updater.invokeFreestylerAPI('check_updates', {
        json: [style.freestylerData]
      }).then(data => (
        !data || !data[0] ? Promise.reject(updater.ERROR_JSON) :
        !data[0].isUpdated ? Promise.reject(updater.SAME_MD5) :
        true
      )).then(() => updater.invokeFreestylerAPI('get_updates', {
        json: [style.freestylerData]
      })).then(data => {
        data = data && data[0] || {};
        const newStyle = tryJSONparse(data.newJson);
        if (newStyle) {
          newStyle.freestylerData = {
            id: data.id,
            hash: data.newHash,
            params: data.newParams,
          };
        }
        return newStyle;
      });
    }

    function maybeValidate(json) {
      if (json.usercssData) {
        // usercss is already validated while building
        return json;
      }
      if (!styleJSONseemsValid(json)) {
        return Promise.reject(updater.ERROR_JSON);
      }
      return json;
    }

    function maybeSave(json) {
      json.id = style.id;
      if (styleSectionsEqual(json, style)) {
        // JSONs may have different order of items even if sections are effectively equal
        // so we'll update the digest anyway
        // always update digest even if (save === false)
        saveStyle(Object.assign(json, {reason: 'update-digest'}));
        return Promise.reject(updater.SAME_CODE);
      } else if (!style.originalDigest && !ignoreDigest) {
        return Promise.reject(updater.MAYBE_EDITED);
      }
      if (!save) {
        return json;
      }
      json.reason = 'update';
      if (json.usercssData) {
        return usercssHelper.save(json);
      }
      json.name = null; // keep local name customizations
      return saveStyle(json);
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

  invokeFreestylerAPI(method, params) {
    return new Promise(resolve => {
      const encodeParam = k =>
        encodeURIComponent(k === 'json' ? JSON.stringify(params[k]) : params[k]);
      const query = Object.keys(params)
        .map(k => k + '=' + encodeParam(k))
        .join('&');
      download(`https://freestyler.ws/api/v2/${method}.php?${query}`)
        .then(text => resolve(params.json ? tryJSONparse(text) : text));
    });
  }
};

updater.schedule();
prefs.subscribe(['updateInterval'], updater.schedule);
