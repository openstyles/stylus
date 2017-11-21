'use strict';

const CHROMIUM = chrome.app && /Chromium/.test(navigator.userAgent); // non-Windows Chromium
const FIREFOX = !chrome.app;
const VIVALDI = chrome.app && /Vivaldi/.test(navigator.userAgent);
const OPERA = chrome.app && /OPR/.test(navigator.userAgent);

document.addEventListener('stylishUpdate', onClick);
document.addEventListener('stylishUpdateChrome', onClick);
document.addEventListener('stylishUpdateOpera', onClick);

document.addEventListener('stylishInstall', onClick);
document.addEventListener('stylishInstallChrome', onClick);
document.addEventListener('stylishInstallOpera', onClick);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // orphaned content script check
  if (msg.method === 'ping') {
    sendResponse(true);
  }
});

// TODO: remove the following statement when USO is fixed
document.documentElement.appendChild(document.createElement('script')).text = '(' +
  function () {
    let settings;
    document.addEventListener('stylusFixBuggyUSOsettings', function _({detail}) {
      document.removeEventListener('stylusFixBuggyUSOsettings', _);
      settings = /\?/.test(detail) && new URLSearchParams(new URL(detail).search);
    });
    const originalResponseJson = Response.prototype.json;
    Response.prototype.json = function (...args) {
      return originalResponseJson.call(this, ...args).then(json => {
        Response.prototype.json = originalResponseJson;
        if (!settings || typeof ((json || {}).style_settings || {}).every !== 'function') {
          return json;
        }
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

new MutationObserver((mutations, observer) => {
  if (document.body) {
    observer.disconnect();
    // TODO: remove the following statement when USO pagination title is fixed
    document.title = document.title.replace(/^(\d+)&\w+=/, '#$1: ');
    chrome.runtime.sendMessage({
      method: 'getStyles',
      url: getMeta('stylish-id-url') || location.href
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
    detail = cloneInto(detail, document); // eslint-disable-line no-undef
  }
  onDOMready().then(() => {
    document.dispatchEvent(new CustomEvent(type, detail));
  });
}


function onClick(event) {
  if (onClick.processing || !orphanCheck || !orphanCheck()) {
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
      url: getMeta('stylish-id-url') || location.href,
    }, ([style]) => {
      saveStyleCode('styleUpdate', style.name, {id: style.id})
        .then(resolve, reject);
    });
  });
}


function saveStyleCode(message, name, addProps) {
  return new Promise((resolve, reject) => {
    const needsConfirmation = message === 'styleInstall' || !saveStyleCode.confirmed;
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
          reason: 'update',
        }),
        style => {
          if (message === 'styleUpdate' && style.updateUrl.includes('?')) {
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
    const button = document.getElementById('update_style_button');
    if (button) {
      button.style.cssText = state ? '' :
        'pointer-events: none !important; opacity: .25 !important;';
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


function orphanCheck() {
  const port = chrome.runtime.connect();
  if (port) {
    port.disconnect();
    return true;
  }
  // we're orphaned due to an extension update
  // we can detach event listeners
  document.removeEventListener('stylishUpdate', onClick);
  document.removeEventListener('stylishUpdateChrome', onClick);
  document.removeEventListener('stylishUpdateOpera', onClick);

  document.removeEventListener('stylishInstall', onClick);
  document.removeEventListener('stylishInstallChrome', onClick);
  document.removeEventListener('stylishInstallOpera', onClick);

  // we can't detach chrome.runtime.onMessage because it's no longer connected internally
  // we can destroy global functions in this context to free up memory
  [
    'checkUpdatability',
    'getMeta',
    'getResource',
    'onDOMready',
    'onClick',
    'onInstall',
    'onUpdate',
    'orphanCheck',
    'saveStyleCode',
    'sendEvent',
    'styleSectionsEqual',
  ].forEach(fn => (window[fn] = null));
}
