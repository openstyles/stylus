/* global API_METHODS usercss saveStyle getStyles chromeLocal cachedStyles */
'use strict';

(() => {

  API_METHODS.saveUsercss = style => save(style, false);
  API_METHODS.saveUsercssUnsafe = style => save(style, true);
  API_METHODS.buildUsercss = build;
  API_METHODS.installUsercss = install;
  API_METHODS.parseUsercss = parse;
  API_METHODS.findUsercss = find;

  const TEMP_CODE_PREFIX = 'tempUsercssCode';
  const TEMP_CODE_CLEANUP_DELAY = 60e3;
  let tempCodeLastWriteDate = 0;
  if (FIREFOX) {
    // the temp code is created on direct installation of usercss URLs in FF
    // and can be left behind in case the install page didn't open in time before
    // the extension was updated/reloaded/disabled or the browser was closed
    setTimeout(function poll() {
      if (Date.now() - tempCodeLastWriteDate < TEMP_CODE_CLEANUP_DELAY) {
        setTimeout(poll, TEMP_CODE_CLEANUP_DELAY);
        return;
      }
      chrome.storage.local.get(null, storage => {
        const leftovers = [];
        for (const key in storage) {
          if (key.startsWith(TEMP_CODE_PREFIX)) {
            leftovers.push(key);
          }
        }
        if (leftovers.length) {
          chrome.storage.local.remove(leftovers);
        }
      });
    }, TEMP_CODE_CLEANUP_DELAY);
  }

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

  function assignVars(style) {
    if (style.reason === 'config' && style.id) {
      return style;
    }
    const dup = find(style);
    if (dup) {
      style.id = dup.id;
      if (style.reason !== 'config') {
        // preserve style.vars during update
        usercss.assignVars(style, dup);
      }
    }
    return style;
  }

  /**
   * Parse the source and find the duplication
   * @param _
   * @param {String} _.sourceCode
   * @param {Boolean=} _.checkDup
   * @param {Boolean=} _.metaOnly
   * @returns {Promise<{style, dup:Boolean?}>}
   */
  function build({
    sourceCode,
    checkDup,
    metaOnly,
  }) {
    const task = buildMeta({sourceCode});
    return (metaOnly ? task : task.then(usercss.buildCode))
      .then(style => ({
        style,
        dup: checkDup && find(style),
      }));
  }

  // Parse the source, apply customizations, report fatal/syntax errors
  function parse(style, allowErrors = false) {
    // restore if stripped by getStyleWithNoCode
    if (typeof style.sourceCode !== 'string') {
      style.sourceCode = cachedStyles.byId.get(style.id).sourceCode;
    }
    return buildMeta(style)
      .then(assignVars)
      .then(style => usercss.buildCode(style, allowErrors));
  }

  function save(style, allowErrors = false) {
    return parse(style, allowErrors)
      .then(result =>
        allowErrors ?
          saveStyle(result.style).then(style => ({style, errors: result.errors})) :
          saveStyle(result));
  }

  /**
   * @param {Style|{name:string, namespace:string}} styleOrData
   * @returns {Style}
   */
  function find(styleOrData) {
    if (styleOrData.id) return cachedStyles.byId.get(styleOrData.id);
    const {name, namespace} = styleOrData.usercssData || styleOrData;
    for (const dup of cachedStyles.list) {
      const data = dup.usercssData;
      if (!data) continue;
      if (data.name === name &&
          data.namespace === namespace) {
        return dup;
      }
    }
  }

  function install({url, direct, downloaded, tab}, sender) {
    tab = tab !== undefined ? tab : sender.tab;
    url = url || tab.url;
    if (direct && !downloaded) {
      prefetchCodeForInstallation(tab.id, url);
    }
    return openURL({
      url: '/install-usercss.html' +
        '?updateUrl=' + encodeURIComponent(url) +
        '&tabId=' + tab.id +
        (direct ? '&direct=yes' : ''),
      index: tab.index + 1,
      openerTabId: tab.id,
      currentWindow: null,
    });
  }

  function prefetchCodeForInstallation(tabId, url) {
    const key = TEMP_CODE_PREFIX + tabId;
    tempCodeLastWriteDate = Date.now();
    Promise.all([
      download(url),
      chromeLocal.setValue(key, {loading: true}),
    ]).then(([code]) => {
      chromeLocal.setValue(key, code);
      setTimeout(() => chromeLocal.remove(key), TEMP_CODE_CLEANUP_DELAY);
    });
  }
})();
