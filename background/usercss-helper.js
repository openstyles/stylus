/* global usercss saveStyle getStyles chromeLocal */
'use strict';

// eslint-disable-next-line no-var
var usercssHelper = (() => {
  function buildMeta(style) {
    if (style.usercssData) {
      return Promise.resolve(style);
    }
    try {
      const {sourceCode} = style;
      // allow sourceCode to be normalized
      delete style.sourceCode;
      return Promise.resolve(Object.assign(usercss.buildMeta(sourceCode), style));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function buildCode(style) {
    return usercss.buildCode(style);
  }

  function wrapReject(pending) {
    return pending
      .catch(err => new Error(Array.isArray(err) ? err.join('\n') : err.message || String(err)));
  }

  // Parse the source and find the duplication
  function build({sourceCode, checkDup = false}, noReject) {
    const pending = buildMeta({sourceCode})
      .then(style => Promise.all([
        buildCode(style),
        checkDup && findDup(style)
      ]))
      .then(([style, dup]) => ({style, dup}));

    return noReject ? wrapReject(pending) : pending;
  }

  function save(style, noReject) {
    const pending = buildMeta(style)
      .then(assignVars)
      .then(buildCode)
      .then(saveStyle);

    return noReject ? wrapReject(pending) : pending;

    function assignVars(style) {
      if (style.reason === 'config' && style.id) {
        return style;
      }
      return findDup(style).then(dup => {
        if (dup) {
          style.id = dup.id;
          if (style.reason !== 'config') {
            // preserve style.vars during update
            usercss.assignVars(style, dup);
          }
        }
        return style;
      });
    }
  }

  function findDup(style) {
    if (style.id) {
      return getStyles({id: style.id}).then(s => s[0]);
    }
    return getStyles().then(styles =>
      styles.find(target => {
        if (!target.usercssData) {
          return false;
        }
        return target.usercssData.name === style.usercssData.name &&
          target.usercssData.namespace === style.usercssData.namespace;
      })
    );
  }

  function openInstallPage(tab, {url = tab.url, direct, downloaded} = {}) {
    if (direct && !downloaded) {
      prefetchCodeForInstallation(tab.id, url);
    }
    return wrapReject(openURL({
      url: '/install-usercss.html' +
        '?updateUrl=' + encodeURIComponent(url) +
        '&tabId=' + tab.id +
        (direct ? '&direct=yes' : ''),
      index: tab.index + 1,
      openerTabId: tab.id,
    }));
  }

  function prefetchCodeForInstallation(tabId, url) {
    const key = 'tempUsercssCode' + tabId;
    Promise.all([
      download(url),
      chromeLocal.setValue(key, {loading: true}),
    ]).then(([code]) => {
      chromeLocal.setValue(key, code);
      setTimeout(() => chromeLocal.remove(key), 60e3);
    });
  }

  return {build, save, findDup, openInstallPage};
})();
