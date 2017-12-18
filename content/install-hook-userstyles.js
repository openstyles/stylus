/* global cloneInto */
'use strict';

(() => {
  const FIREFOX = !chrome.app;
  const VIVALDI = chrome.app && /Vivaldi/.test(navigator.userAgent);
  const OPERA = chrome.app && /OPR/.test(navigator.userAgent);

  window.dispatchEvent(new CustomEvent(chrome.runtime.id + '-install'));
  window.addEventListener(chrome.runtime.id + '-install', orphanCheck, true);

  ['Update', 'Install'].forEach(type =>
    ['', 'Chrome', 'Opera'].forEach(browser =>
      document.addEventListener('stylish' + type + browser, onClick)));

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.method) {
      case 'ping':
        // orphaned content script check
        sendResponse(true);
        break;
      case 'openSettings':
        openSettings();
        sendResponse(true);
        break;
    }
  });

  new MutationObserver((mutations, observer) => {
    if (document.body) {
      observer.disconnect();
      // TODO: remove the following statement when USO pagination title is fixed
      document.title = document.title.replace(/^(\d+)&\w+=/, '#$1: ');
      chrome.runtime.sendMessage({
        method: 'getStyles',
        md5Url: getMeta('stylish-md5-url') || location.href
      }, checkUpdatability);
    }
  }).observe(document.documentElement, {childList: true});

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

  function checkUpdatability([installedStyle]) {
    // TODO: remove the following statement when USO is fixed
    document.dispatchEvent(new CustomEvent('stylusFixBuggyUSOsettings', {
      detail: installedStyle && installedStyle.updateUrl,
    }));
    if (!installedStyle) {
      sendEvent('styleCanBeInstalledChrome');
      return;
    }
    const md5Url = getMeta('stylish-md5-url');
    if (md5Url && installedStyle.md5Url && installedStyle.originalMd5) {
      getResource(md5Url).then(md5 => {
        reportUpdatable(md5 !== installedStyle.originalMd5);
      });
    } else {
      getStyleJson().then(json => {
        reportUpdatable(!json ||
          !styleSectionsEqual(json, installedStyle));
      });
    }

    function reportUpdatable(isUpdatable) {
      sendEvent(
        isUpdatable
          ? 'styleCanBeUpdatedChrome'
          : 'styleAlreadyInstalledChrome',
        {
          updateUrl: installedStyle.updateUrl
        }
      );
    }
  }


  function sendEvent(type, detail = null) {
    if (FIREFOX) {
      type = type.replace('Chrome', '');
    } else if (OPERA || VIVALDI) {
      type = type.replace('Chrome', 'Opera');
    }
    detail = {detail};
    if (typeof cloneInto !== 'undefined') {
      // Firefox requires explicit cloning, however USO can't process our messages anyway
      // because USO tries to use a global "event" variable deprecated in Firefox
      detail = cloneInto(detail, document);
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
    (event.type.includes('Update') ? onUpdate() : onInstall())
      .then(done, done);
    function done() {
      setTimeout(() => {
        onClick.processing = false;
      });
    }
  }


  function onInstall() {
    return getResource(getMeta('stylish-description'))
      .then(name => saveStyleCode('styleInstall', name))
      .then(() => getResource(getMeta('stylish-install-ping-url-chrome')));
  }


  function onUpdate() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'getStyles',
        md5Url: getMeta('stylish-md5-url') || location.href,
      }, ([style]) => {
        saveStyleCode('styleUpdate', style.name, {id: style.id})
          .then(resolve, reject);
      });
    });
  }


  function saveStyleCode(message, name, addProps) {
    return new Promise((resolve, reject) => {
      const isNew = message === 'styleInstall';
      const needsConfirmation = isNew || !saveStyleCode.confirmed;
      if (needsConfirmation && !confirm(chrome.i18n.getMessage(message, [name]))) {
        reject();
        return;
      }
      saveStyleCode.confirmed = true;
      enableUpdateButton(false);
      getStyleJson().then(json => {
        if (!json) {
          prompt(chrome.i18n.getMessage('styleInstallFailed', ''),
            'https://github.com/openstyles/stylus/issues/195');
          return;
        }
        chrome.runtime.sendMessage(
          Object.assign(json, addProps, {
            method: 'saveStyle',
            reason: isNew ? 'install' : 'update',
          }),
          style => {
            if (!isNew && style.updateUrl.includes('?')) {
              enableUpdateButton(true);
            } else {
              sendEvent('styleInstalledChrome');
            }
          }
        );
        resolve();
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


  function getResource(url) {
    return new Promise(resolve => {
      if (url.startsWith('#')) {
        resolve(document.getElementById(url.slice(1)).textContent);
      } else {
        chrome.runtime.sendMessage({method: 'download', url}, resolve);
      }
    });
  }


  function getStyleJson() {
    const url = getStyleURL();
    return getResource(url).then(code => {
      try {
        return JSON.parse(code);
      } catch (e) {
        return fetch(url).then(r => r.json()).catch(() => null);
      }
    });
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
    const button = document.querySelector('.advanced_button') ||
      document.evaluate('//*[not(*) and contains(., "Advanced Style Settings")]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
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
    if (chrome.i18n && chrome.i18n.getUILanguage()) {
      return true;
    }
    // In Chrome content script is orphaned on an extension update/reload
    // so we need to detach event listeners
    window.removeEventListener(chrome.runtime.id + '-install', orphanCheck, true);
    ['Update', 'Install'].forEach(type =>
      ['', 'Chrome', 'Opera'].forEach(browser =>
        document.addEventListener('stylish' + type + browser, onClick)));
  }
})();

// TODO: remove the following statement when USO is fixed
document.documentElement.appendChild(document.createElement('script')).text = '(' +
  function () {
    let settings;
    const originalResponseJson = Response.prototype.json;
    document.currentScript.remove();
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
  } + ')()';

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
