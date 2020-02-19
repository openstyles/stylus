/* global API_METHODS usercss styleManager deepCopy openURL download URLS getTab */
/* exports usercssHelper */
'use strict';

// eslint-disable-next-line no-unused-vars
const usercssHelper = (() => {
  const installCodeCache = {};
  const clearInstallCode = url => delete installCodeCache[url];
  const isResponseText = r => /^text\/(css|plain)(;.*?)?$/i.test(r.headers.get('content-type'));
  // in Firefox we have to use a content script to read file://
  const fileLoader = !chrome.app && // not relying on navigator.ua which can be spoofed
    (tabId => browser.tabs.executeScript(tabId, {file: '/content/install-hook-usercss.js'}).then(r => r[0]));

  API_METHODS.installUsercss = installUsercss;
  API_METHODS.editSaveUsercss = editSaveUsercss;
  API_METHODS.configUsercssVars = configUsercssVars;

  API_METHODS.buildUsercss = build;
  API_METHODS.findUsercss = find;

  API_METHODS.getUsercssInstallCode = url => {
    // when the installer tab is reloaded after the cache is expired, this will throw intentionally
    const {code, timer} = installCodeCache[url];
    clearInstallCode(url);
    clearTimeout(timer);
    return code;
  };

  return {

    testUrl(url) {
      return url.includes('.user.') &&
        /^(https?|file|ftps?):/.test(url) &&
        /\.user\.(css|styl)$/.test(url.split(/[#?]/, 1)[0]);
    },

    /** @return {Promise<{ code:string, inTab:boolean } | false>} */
    testContents(tabId, url) {
      const isFile = url.startsWith('file:');
      const inTab = isFile && Boolean(fileLoader);
      return Promise.resolve(isFile || fetch(url, {method: 'HEAD'}).then(isResponseText))
        .then(ok => ok && (inTab ? fileLoader(tabId) : download(url)))
        .then(code => /==userstyle==/i.test(code) && {code, inTab});
    },

    openInstallerPage(tabId, url, {code, inTab} = {}) {
      const newUrl = `${URLS.installUsercss}?updateUrl=${encodeURIComponent(url)}`;
      if (inTab) {
        getTab(tabId).then(tab =>
          openURL({
            url: `${newUrl}&tabId=${tabId}`,
            active: tab.active,
            index: tab.index + 1,
            openerTabId: tabId,
            currentWindow: null,
          }));
      } else {
        const timer = setTimeout(clearInstallCode, 10e3, url);
        installCodeCache[url] = {code, timer};
        chrome.tabs.update(tabId, {url: newUrl});
      }
    },
  };

  function buildMeta(style) {
    if (style.usercssData) {
      return Promise.resolve(style);
    }

    // allow sourceCode to be normalized
    const {sourceCode} = style;
    delete style.sourceCode;

    return usercss.buildMeta(sourceCode)
      .then(newStyle => Object.assign(newStyle, style));
  }

  function assignVars(style) {
    return find(style)
      .then(dup => {
        if (dup) {
          style.id = dup.id;
          // preserve style.vars during update
          return usercss.assignVars(style, dup)
            .then(() => style);
        }
        return style;
      });
  }

  /**
   * Parse the source, find the duplication, and build sections with variables
   * @param _
   * @param {String} _.sourceCode
   * @param {Boolean=} _.checkDup
   * @param {Boolean=} _.metaOnly
   * @param {Object} _.vars
   * @param {Boolean=} _.assignVars
   * @returns {Promise<{style, dup:Boolean?}>}
   */
  function build({
    styleId,
    sourceCode,
    checkDup,
    metaOnly,
    vars,
    assignVars = false,
  }) {
    return usercss.buildMeta(sourceCode)
      .then(style => {
        const findDup = checkDup || assignVars ?
          find(styleId ? {id: styleId} : style) : Promise.resolve();
        return Promise.all([
          metaOnly ? style : doBuild(style, findDup),
          findDup
        ]);
      })
      .then(([style, dup]) => ({style, dup}));

    function doBuild(style, findDup) {
      if (vars || assignVars) {
        const getOld = vars ? Promise.resolve({usercssData: {vars}}) : findDup;
        return getOld
          .then(oldStyle => usercss.assignVars(style, oldStyle))
          .then(() => usercss.buildCode(style));
      }
      return usercss.buildCode(style);
    }
  }

  // Build the style within aditional properties then inherit variable values
  // from the old style.
  function parse(style) {
    return buildMeta(style)
      .then(buildMeta)
      .then(assignVars)
      .then(usercss.buildCode);
  }

  // FIXME: simplify this to `installUsercss(sourceCode)`?
  function installUsercss(style) {
    return parse(style)
      .then(styleManager.installStyle);
  }

  // FIXME: simplify this to `editSaveUsercss({sourceCode, exclusions})`?
  function editSaveUsercss(style) {
    return parse(style)
      .then(styleManager.editSave);
  }

  function configUsercssVars(id, vars) {
    return styleManager.get(id)
      .then(style => {
        const newStyle = deepCopy(style);
        newStyle.usercssData.vars = vars;
        return usercss.buildCode(newStyle);
      })
      .then(style => styleManager.installStyle(style, 'config'))
      .then(style => style.usercssData.vars);
  }

  /**
   * @param {Style|{name:string, namespace:string}} styleOrData
   * @returns {Style}
   */
  function find(styleOrData) {
    if (styleOrData.id) {
      return styleManager.get(styleOrData.id);
    }
    const {name, namespace} = styleOrData.usercssData || styleOrData;
    return styleManager.getAllStyles().then(styleList => {
      for (const dup of styleList) {
        const data = dup.usercssData;
        if (!data) continue;
        if (data.name === name &&
            data.namespace === namespace) {
          return dup;
        }
      }
    });
  }
})();
