/* global cloneInto msg API */
'use strict';

(() => {
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

  let gotBody = false;
  let currentMd5;
  new MutationObserver(observeDOM).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  observeDOM();

  function observeDOM() {
    if (!gotBody) {
      if (!document.body) return;
      gotBody = true;
      // TODO: remove the following statement when USO pagination title is fixed
      document.title = document.title.replace(/^(\d+)&\w+=/, '#$1: ');
      const md5Url = getMeta('stylish-md5-url') || location.href;
      Promise.all([
        API.findStyle({md5Url}),
        getResource(md5Url)
      ])
      .then(checkUpdatability);
    }
    if (document.getElementById('install_button')) {
      onDOMready().then(() => {
        requestAnimationFrame(() => {
          sendEvent(sendEvent.lastEvent);
        });
      });
    }
  }

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
    document.dispatchEvent(new CustomEvent('stylusFixBuggyUSOsettings', {
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
          subtree: true
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
            updateUrl: installedStyle.updateUrl
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
      md5Url: getMeta('stylish-md5-url') || location.href
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


  function styleSectionsEqual({sections: a}, {sections: b}) {
    if (!a || !b) {
      return undefined;
    }
    if (a.length !== b.length) {
      return false;
    }
    // order of sections should be identical to account for the case of multiple
    // sections matching the same URL because the order of rules is part of cascading
    return a.every((sectionA, index) => propertiesEqual(sectionA, b[index]));

    function propertiesEqual(secA, secB) {
      for (const name of ['urlPrefixes', 'urls', 'domains', 'regexps']) {
        if (!equalOrEmpty(secA[name], secB[name], 'every', arrayMirrors)) {
          return false;
        }
      }
      return equalOrEmpty(secA.code, secB.code, 'substr', (a, b) => a === b);
    }

    function equalOrEmpty(a, b, telltale, comparator) {
      const typeA = a && typeof a[telltale] === 'function';
      const typeB = b && typeof b[telltale] === 'function';
      return (
        (a === null || a === undefined || (typeA && !a.length)) &&
        (b === null || b === undefined || (typeB && !b.length))
      ) || typeA && typeB && a.length === b.length && comparator(a, b);
    }

    function arrayMirrors(array1, array2) {
      return (
        array1.every(el => array2.includes(el)) &&
        array2.every(el => array1.includes(el))
      );
    }
  }


  function onDOMready() {
    if (document.readyState !== 'loading') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', function _() {
        document.removeEventListener('DOMContentLoaded', _);
        resolve();
      });
    });
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
    // TODO: switch to install-hook-usercss.js impl, and remove explicit orphanCheck() calls
    if (chrome.i18n && chrome.i18n.getUILanguage()) {
      return true;
    }
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

// run in page context
document.documentElement.appendChild(document.createElement('script')).text = '(' + (
  () => {
    document.currentScript.remove();

    // spoof Stylish extension presence in Chrome
    if (window.chrome && chrome.app) {
      const realImage = window.Image;
      window.Image = function Image(...args) {
        return new Proxy(new realImage(...args), {
          get(obj, key) {
            return obj[key];
          },
          set(obj, key, value) {
            if (key === 'src' && /^chrome-extension:/i.test(value)) {
              setTimeout(() => typeof obj.onload === 'function' && obj.onload());
            } else {
              obj[key] = value;
            }
            return true;
          },
        });
      };
    }

    // USO bug workaround: use the actual style settings in API response
    let settings;
    const originalResponseJson = Response.prototype.json;
    document.addEventListener('stylusFixBuggyUSOsettings', function _({detail}) {
      document.removeEventListener('stylusFixBuggyUSOsettings', _);
      // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
      settings = /\?/.test(detail) && new URLSearchParams(new URL(detail).search.replace(/^\?/, ''));
      if (!settings) {
        Response.prototype.json = originalResponseJson;
      }
    });
    Response.prototype.json = function (...args) {
      return originalResponseJson.call(this, ...args).then(json => {
        if (!settings || typeof ((json || {}).style_settings || {}).every !== 'function') {
          return json;
        }
        Response.prototype.json = originalResponseJson;
        const images = new Map();
        for (const jsonSetting of json.style_settings) {
          let value = settings.get('ik-' + jsonSetting.install_key);
          if (!value
          || !jsonSetting.style_setting_options
          || !jsonSetting.style_setting_options[0]) {
            continue;
          }
          if (value.startsWith('ik-')) {
            value = value.replace(/^ik-/, '');
            const defaultItem = jsonSetting.style_setting_options.find(item => item.default);
            if (!defaultItem || defaultItem.install_key !== value) {
              if (defaultItem) {
                defaultItem.default = false;
              }
              jsonSetting.style_setting_options.some(item => {
                if (item.install_key === value) {
                  item.default = true;
                  return true;
                }
              });
            }
          } else if (jsonSetting.setting_type === 'image') {
            jsonSetting.style_setting_options.some(item => {
              if (item.default) {
                item.default = false;
                return true;
              }
            });
            images.set(jsonSetting.install_key, value);
          } else {
            const item = jsonSetting.style_setting_options[0];
            if (item.value !== value && item.install_key === 'placeholder') {
              item.value = value;
            }
          }
        }
        if (images.size) {
          new MutationObserver((_, observer) => {
            if (!document.getElementById('style-settings')) {
              return;
            }
            observer.disconnect();
            for (const [name, url] of images.entries()) {
              const elRadio = document.querySelector(`input[name="ik-${name}"][value="user-url"]`);
              const elUrl = elRadio && document.getElementById(elRadio.id.replace('url-choice', 'user-url'));
              if (elUrl) {
                elUrl.value = url;
              }
            }
          }).observe(document, {childList: true, subtree: true});
        }
        return json;
      });
    };
  }
) + `)('${chrome.runtime.getURL('').slice(0, -1)}')`;

// TODO: remove the following statement when USO pagination is fixed
if (location.search.includes('category=')) {
  document.addEventListener('DOMContentLoaded', function _() {
    document.removeEventListener('DOMContentLoaded', _);
    new MutationObserver((_, observer) => {
      if (!document.getElementById('pagination')) {
        return;
      }
      observer.disconnect();
      const category = '&' + location.search.match(/category=[^&]+/)[0];
      const links = document.querySelectorAll('#pagination a[href*="page="]:not([href*="category="])');
      for (let i = 0; i < links.length; i++) {
        links[i].href += category;
      }
    }).observe(document, {childList: true, subtree: true});
  });
}

if (/^https?:\/\/userstyles\.org\/styles\/\d{3,}/.test(location.href)) {
  new MutationObserver((_, observer) => {
    const cssButton = document.getElementsByClassName('css_button');
    if (cssButton.length) {
      // Click on the "Show CSS Code" button to workaround the JS error
      cssButton[0].click();
      cssButton[0].click();
      observer.disconnect();
    }
  }).observe(document, {childList: true, subtree: true});
}
