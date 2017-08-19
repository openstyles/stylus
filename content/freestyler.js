'use strict';

// IIFE simplifies garbage-collection on orphaning or non-style pages
(() => {
  if (!getPageData().id) {
    return;
  }
  getInstalledStyle().then(setPageDataAndNotify);
  notifyPage(chrome.runtime.id);

  const pageListeners = {
    install: onUpdate,
    update: onUpdate,
    applyParams: onUpdate,
    uninstall: onUninstall,
    stylesManager: onStylesManager,
    [chrome.runtime.id]: orphanCheck,
  };

  for (const name of Object.keys(pageListeners)) {
    window.addEventListener(name, pageListeners[name]);
  }


  function onUpdate(event) {
    const pageData = getPageData();
    let installedStyle;
    getInstalledStyle()
      .then(checkIfEdited)
      .then(makeSiteRequest)
      .then(maybeSaveStyle)
      .then(setPageDataAndNotify)
      .catch(() => notifyPage(
        event.type === 'install' ? 'installFailed' :
        event.type === 'update' ? 'updateFailed' :
        event.type === 'applyParams' ? 'applyFailed' : ''
      ));

    function checkIfEdited(style) {
      return style && invokeBG('calcStyleDigest', {id: style.id})
        .then(digest => {
          if (digest === style.originalDigest ||
              confirm(chrome.i18n.getMessage('updateCheckManualUpdateForce'))) {
            return style;
          } else {
            setPageDataAndNotify(style);
            return Promise.reject();
          }
        });
    }

    function makeSiteRequest(style) {
      installedStyle = style;
      return invokeFreestylerAPI('get_styles_json', {
        json: [Object.assign(
          pickProps(pageData, [
            'id',
            'params'
          ]), installedStyle && {
            'installed_params': pickProps(installedStyle.freestylerData, [
              'params',
              'hash',
            ]),
            'installed_hash': installedStyle.freestylerData.hash,
          }
        )]
      });
    }

    function maybeSaveStyle(data) {
      data = data && data[0] || {};
      const style = tryJSONparse(data.json);
      if (!styleJSONseemsValid(style)) {
        return Promise.reject();
      }
      return invokeBG('saveStyle', {
        reason: 'update',
        url: getStyleUrl(),
        id: installedStyle && installedStyle.id,
        name: !installedStyle && style.name,
        sections: style.sections,
        freestylerData: {
          id: data.id,
          hash: data.jsonHash,
          params: pageData.params,
        },
        // use a dummmy URL to make this style updatable
        updateUrl: location.origin,
      });
    }
  }


  function onUninstall() {
    getInstalledStyle().then(style => {
      if (style && confirm(chrome.i18n.getMessage('deleteStyleConfirm'))) {
        invokeBG('deleteStyle', style);
        style = null;
      }
      setPageDataAndNotify(style);
    });
  }


  function onStylesManager() {
    getInstalledStyle().then(style => {
      invokeBG('openManager', {
        styleId: (style || {}).id,
      });
    });
  }


  function getInstalledStyle() {
    return invokeBG('getStyles', {
      url: getStyleUrl(),
    }).then(styles => styles[0]);
  }


  function styleJSONseemsValid(style) {
    return (
      style &&
      style.name && typeof style.name === 'string' &&
      style.sections && typeof style.sections.splice === 'function' &&
      typeof (style.sections[0] || {}).code === 'string'
    );
  }


  function setPageDataAndNotify(style) {
    $id('plugin-data-container').value = JSON.stringify(style ? [style.freestylerData] : []);
    $id('plugin-info-container').value = JSON.stringify({version: '2.4.1.3'});
    notifyPage('pluginReady');
  }


  function invokeFreestylerAPI(method, params) {
    return new Promise(resolve => {
      const encodeParam = k =>
        encodeURIComponent(k === 'json' ? JSON.stringify(params[k]) : params[k]);
      const query = Object.keys(params)
        .map(k => k + '=' + encodeParam(k))
        .join('&');
      invokeBG('download', {
        url: `https://${location.hostname}/api/v2/${method}.php?${query}`,
      }).then(text => {
        resolve(params.json ? tryJSONparse(text) : text);
      });
    });
  }


  function notifyPage(message) {
    if (message) {
      window.dispatchEvent(new CustomEvent(message));
    }
  }


  function getPageData() {
    // the data may change during page lifetime
    return tryJSONparse($id('site-data-container').value) || '';
  }


  function getStyleUrl() {
    return location.href.replace(/#.*/, '');
  }


  function $id(id) {
    return document.getElementById(id) || '';
  }


  function tryJSONparse(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {}
  }


  function pickProps(obj, names) {
    const result = {};
    for (const name of names) {
      result[name] = obj[name];
    }
    return result;
  }


  function invokeBG(method, params) {
    return new Promise(resolve => {
      params.method = method;
      chrome.runtime.sendMessage(params, resolve);
    });
  }


  function orphanCheck() {
    const port = chrome.runtime.connect();
    if (port) {
      port.disconnect();
    } else {
      // we're orphaned due to an extension update
      for (const name of Object.keys(pageListeners)) {
        window.removeEventListener(name, pageListeners[name]);
      }
    }
  }
})();
