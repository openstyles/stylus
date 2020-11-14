/* global cloneInto msg API */
'use strict';

// eslint-disable-next-line no-unused-expressions
/^\/styles\/(\d+)(\/([^/]*))?([?#].*)?$/.test(location.pathname) && (() => {
  const styleId = RegExp.$1;
  const pageEventId = `${performance.now()}${Math.random()}`;

  window.dispatchEvent(new CustomEvent(chrome.runtime.id + '-install'));
  window.addEventListener(chrome.runtime.id + '-install', orphanCheck, true);

  document.addEventListener('stylishInstallChrome', onClick);
  document.addEventListener('stylishUpdateChrome', onClick);

  msg.on(onMessage);

  onDOMready().then(() => {
    window.postMessage({
      direction: 'from-content-script',
      message: 'StylishInstalled',
    }, '*');
  });

  let currentMd5;
  const md5Url = getMeta('stylish-md5-url') || `https://update.userstyles.org/${styleId}.md5`;
  Promise.all([
    API.findStyle({md5Url}),
    getResource(md5Url),
    onDOMready(),
  ]).then(checkUpdatability);

  document.documentElement.appendChild(
    Object.assign(document.createElement('script'), {
      textContent: `(${inPageContext})('${pageEventId}')`,
    }));

  function onMessage(msg) {
    switch (msg.method) {
      case 'ping':
        // orphaned content script check
        return true;
      case 'openSettings':
        openSettings();
        return true;
    }
  }

  /* since we are using "stylish-code-chrome" meta key on all browsers and
    US.o does not provide "advanced settings" on this url if browser is not Chrome,
    we need to fix this URL using "stylish-update-url" meta key
  */
  function getStyleURL() {
    const textUrl = getMeta('stylish-update-url') || '';
    const jsonUrl = getMeta('stylish-code-chrome') ||
      textUrl.replace(/styles\/(\d+)\/[^?]*/, 'styles/chrome/$1.json');
    const paramsMissing = !jsonUrl.includes('?') && textUrl.includes('?');
    return jsonUrl + (paramsMissing ? textUrl.replace(/^[^?]+/, '') : '');
  }

  function checkUpdatability([installedStyle, md5]) {
    // TODO: remove the following statement when USO is fixed
    document.dispatchEvent(new CustomEvent(pageEventId, {
      detail: installedStyle && installedStyle.updateUrl,
    }));
    currentMd5 = md5;
    if (!installedStyle) {
      sendEvent({type: 'styleCanBeInstalledChrome'});
      return;
    }
    const isCustomizable = /\?/.test(installedStyle.updateUrl);
    const md5Url = getMeta('stylish-md5-url');
    if (md5Url && installedStyle.md5Url && installedStyle.originalMd5) {
      reportUpdatable(isCustomizable || md5 !== installedStyle.originalMd5);
    } else {
      getStyleJson().then(json => {
        reportUpdatable(
          isCustomizable ||
          !json ||
          !styleSectionsEqual(json, installedStyle));
      });
    }

    function prepareInstallButton() {
      return new Promise(resolve => {
        const observer = new MutationObserver(check);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        check();

        function check() {
          if (document.querySelector('#install_style_button')) {
            resolve();
            observer.disconnect();
          }
        }
      });
    }

    function reportUpdatable(isUpdatable) {
      prepareInstallButton().then(() => {
        sendEvent({
          type: isUpdatable
            ? 'styleCanBeUpdatedChrome'
            : 'styleAlreadyInstalledChrome',
          detail: {
            updateUrl: installedStyle.updateUrl,
          },
        });
      });
    }
  }


  function sendEvent(event) {
    sendEvent.lastEvent = event;
    let {type, detail = null} = event;
    if (typeof cloneInto !== 'undefined') {
      // Firefox requires explicit cloning, however USO can't process our messages anyway
      // because USO tries to use a global "event" variable deprecated in Firefox
      detail = cloneInto({detail}, document);
    } else {
      detail = {detail};
    }
    onDOMready().then(() => {
      document.dispatchEvent(new CustomEvent(type, detail));
    });
  }

  function onClick(event) {
    if (onClick.processing || !orphanCheck()) {
      return;
    }
    onClick.processing = true;
    doInstall()
      .then(() => {
        if (!event.type.includes('Update')) {
          // FIXME: sometimes the button is broken i.e. the button sends
          // 'install' instead of 'update' event while the style is already
          // install.
          // This triggers an incorrect install count but we don't really care.
          return getResource(getMeta('stylish-install-ping-url-chrome'));
        }
      })
      .catch(console.error)
      .then(done);
    function done() {
      setTimeout(() => {
        onClick.processing = false;
      });
    }
  }

  function doInstall() {
    let oldStyle;
    return API.findStyle({
      md5Url: getMeta('stylish-md5-url') || location.href,
    }, true)
      .then(_oldStyle => {
        oldStyle = _oldStyle;
        return oldStyle ?
          oldStyle.name :
          getResource(getMeta('stylish-description'));
      })
      .then(name => {
        const props = {};
        if (oldStyle) {
          props.id = oldStyle.id;
        }
        return saveStyleCode(oldStyle ? 'styleUpdate' : 'styleInstall', name, props);
      });
  }

  function saveStyleCode(message, name, addProps = {}) {
    const isNew = message === 'styleInstall';
    const needsConfirmation = isNew || !saveStyleCode.confirmed;
    if (needsConfirmation && !confirm(chrome.i18n.getMessage(message, [name]))) {
      return Promise.reject();
    }
    saveStyleCode.confirmed = true;
    enableUpdateButton(false);
    return getStyleJson().then(json => {
      if (!json) {
        prompt(chrome.i18n.getMessage('styleInstallFailed', ''),
          'https://github.com/openstyles/stylus/issues/195');
        return;
      }
      // Update originalMd5 since USO changed it (2018-11-11) to NOT match the current md5
      return API.installStyle(Object.assign(json, addProps, {originalMd5: currentMd5}))
        .then(style => {
          if (!isNew && style.updateUrl.includes('?')) {
            enableUpdateButton(true);
          } else {
            sendEvent({type: 'styleInstalledChrome'});
          }
        });
    });

    function enableUpdateButton(state) {
      const important = s => s.replace(/;/g, '!important;');
      const button = document.getElementById('update_style_button');
      if (button) {
        button.style.cssText = state ? '' : important('pointer-events: none; opacity: .35;');
        const icon = button.querySelector('img[src*=".svg"]');
        if (icon) {
          icon.style.cssText = state ? '' : important('transition: transform 5s; transform: rotate(0);');
          if (state) {
            setTimeout(() => (icon.style.cssText += important('transform: rotate(10turn);')));
          }
        }
      }
    }
  }

  function getMeta(name) {
    const e = document.querySelector(`link[rel="${name}"]`);
    return e ? e.getAttribute('href') : null;
  }

  function getResource(url, options) {
    if (url.startsWith('#')) {
      return Promise.resolve(document.getElementById(url.slice(1)).textContent);
    }
    return API.download(Object.assign({
      url,
      timeout: 60e3,
      // USO can't handle POST requests for style json
      body: null,
    }, options))
      .catch(error => {
        alert('Error' + (error ? '\n' + error : ''));
        throw error;
      });
  }

  // USO providing md5Url as "https://update.update.userstyles.org/#####.md5"
  // instead of "https://update.userstyles.org/#####.md5"
  function tryFixMd5(style) {
    if (style && style.md5Url && style.md5Url.includes('update.update')) {
      style.md5Url = style.md5Url.replace('update.update', 'update');
    }
    return style;
  }

  function getStyleJson() {
    return getResource(getStyleURL(), {responseType: 'json'})
      .then(style => {
        if (!style || !Array.isArray(style.sections) || style.sections.length) {
          return style;
        }
        const codeElement = document.getElementById('stylish-code');
        if (codeElement && !codeElement.textContent.trim()) {
          return style;
        }
        return getResource(getMeta('stylish-update-url'))
          .then(code => API.parseCss({code}))
          .then(result => {
            style.sections = result.sections;
            return style;
          });
      })
      .then(tryFixMd5)
      .catch(() => null);
  }

  /**
   * The sections are checked in successive order because it matters when many sections
   * match the same URL and they have rules with the same CSS specificity
   * @param {Object} a - first style object
   * @param {Object} b - second style object
   * @returns {?boolean}
   */
  function styleSectionsEqual({sections: a}, {sections: b}) {
    const targets = ['urls', 'urlPrefixes', 'domains', 'regexps'];
    return a && b && a.length === b.length && a.every(sameSection);
    function sameSection(secA, i) {
      return equalOrEmpty(secA.code, b[i].code, 'string', (a, b) => a === b) &&
        targets.every(target => equalOrEmpty(secA[target], b[i][target], 'array', arrayMirrors));
    }
    function equalOrEmpty(a, b, type, comparator) {
      const typeA = type === 'array' ? Array.isArray(a) : typeof a === type;
      const typeB = type === 'array' ? Array.isArray(b) : typeof b === type;
      return typeA && typeB && comparator(a, b) ||
        (a == null || typeA && !a.length) &&
        (b == null || typeB && !b.length);
    }
    function arrayMirrors(a, b) {
      return a.length === b.length &&
        a.every(el => b.includes(el)) &&
        b.every(el => a.includes(el));
    }
  }

  function onDOMready() {
    return document.readyState !== 'loading'
      ? Promise.resolve()
      : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  }

  function openSettings(countdown = 10e3) {
    const button = document.querySelector('.customize_button');
    if (button) {
      button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      setTimeout(function pollArea(countdown = 2000) {
        const area = document.getElementById('advancedsettings_area');
        if (area || countdown < 0) {
          (area || button).scrollIntoView({behavior: 'smooth', block: area ? 'end' : 'center'});
        } else {
          setTimeout(pollArea, 100, countdown - 100);
        }
      }, 500);
    } else if (countdown > 0) {
      setTimeout(openSettings, 100, countdown - 100);
    }
  }

  function orphanCheck() {
    try {
      if (chrome.i18n.getUILanguage()) {
        return true;
      }
    } catch (e) {}
    // In Chrome content script is orphaned on an extension update/reload
    // so we need to detach event listeners
    window.removeEventListener(chrome.runtime.id + '-install', orphanCheck, true);
    document.removeEventListener('stylishInstallChrome', onClick);
    document.removeEventListener('stylishUpdateChrome', onClick);
    try {
      msg.off(onMessage);
    } catch (e) {}
  }
})();

function inPageContext(eventId) {
  document.currentScript.remove();
  const origMethods = {
    json: Response.prototype.json,
    byId: document.getElementById,
  };
  let vars;
  // USO bug workaround: prevent errors in console after install and busy cursor
  document.getElementById = id =>
    origMethods.byId.call(document, id) ||
    (/^(stylish-code|stylish-installed-style-installed-\w+|post-install-ad|style-install-unknown)$/.test(id)
      ? Object.assign(document.createElement('p'), {className: 'afterdownload-ad'})
      : null);
  // USO bug workaround: use the actual image data in customized settings
  document.addEventListener(eventId, ({detail}) => {
    vars = /\?/.test(detail) && new URL(detail).searchParams;
    if (!vars) Response.prototype.json = origMethods.json;
  }, {once: true});
  Response.prototype.json = async function () {
    const json = await origMethods.json.apply(this, arguments);
    if (vars && json && Array.isArray(json.style_settings)) {
      Response.prototype.json = origMethods.json;
      const images = new Map();
      for (const ss of json.style_settings) {
        const value = vars.get('ik-' + ss.install_key);
        if (value && ss.setting_type === 'image' && ss.style_setting_options) {
          let isListed;
          for (const opt of ss.style_setting_options) {
            isListed |= opt.default = (opt.value === value);
          }
          images.set(ss.install_key, {url: value, isListed});
        }
      }
      if (images.size) {
        new MutationObserver((_, observer) => {
          if (document.getElementById('style-settings')) {
            observer.disconnect();
            for (const [name, {url, isListed}] of images) {
              const elRadio = document.querySelector(`input[name="ik-${name}"][value="user-url"]`);
              const elUrl = elRadio &&
                            document.getElementById(elRadio.id.replace('url-choice', 'user-url'));
              if (elUrl) {
                elRadio.checked = !isListed;
                elUrl.value = url;
              }
            }
          }
        }).observe(document, {childList: true, subtree: true});
      }
    }
    return json;
  };
}
