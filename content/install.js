'use strict';

const CHROMIUM = /Chromium/.test(navigator.userAgent); // non-Windows Chromium
const FIREFOX = /Firefox/.test(navigator.userAgent);
const VIVALDI = /Vivaldi/.test(navigator.userAgent);
const OPERA = /OPR/.test(navigator.userAgent);

document.addEventListener('stylishUpdate', onUpdateClicked);
document.addEventListener('stylishUpdateChrome', onUpdateClicked);
document.addEventListener('stylishUpdateOpera', onUpdateClicked);

document.addEventListener('stylishInstall', onInstallClicked);
document.addEventListener('stylishInstallChrome', onInstallClicked);
document.addEventListener('stylishInstallOpera', onInstallClicked);

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
    document.title = document.title.replace(/^\d+&category=/, '');
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
  const url = getMeta('stylish-code-chrome');
  // TODO: remove when USO is fixed
  const directUrl = getMeta('stylish-update-url');
  if (directUrl.includes('?') && !url.includes('?')) {
    /* get custom settings from the update url */
    return Object.assign(new URL(url), {
      search: (new URL(directUrl)).search
    }).href;
  }
  return url;
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
    getResource(getStyleURL()).then(code => {
      reportUpdatable(code === null ||
        !styleSectionsEqual(JSON.parse(code), installedStyle));
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


function onInstallClicked() {
  if (!orphanCheck || !orphanCheck()) {
    return;
  }
  getResource(getMeta('stylish-description'))
    .then(name => saveStyleCode('styleInstall', name))
    .then(() => getResource(getMeta('stylish-install-ping-url-chrome')));
}


function onUpdateClicked() {
  if (!orphanCheck || !orphanCheck()) {
    return;
  }
  chrome.runtime.sendMessage({
    method: 'getStyles',
    url: getMeta('stylish-id-url') || location.href,
  }, ([style]) => {
    saveStyleCode('styleUpdate', style.name, {id: style.id});
  });
}


function saveStyleCode(message, name, addProps) {
  return new Promise(resolve => {
    if (!confirm(chrome.i18n.getMessage(message, [name]))) {
      return;
    }
    enableUpdateButton(false);
    getResource(getStyleURL()).then(code => {
      chrome.runtime.sendMessage(
        Object.assign(JSON.parse(code), addProps, {
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


function styleSectionsEqual({sections: a}, {sections: b}) {
  if (!a || !b) {
    return undefined;
  }
  if (a.length !== b.length) {
    return false;
  }
  const checkedInB = [];
  return a.every(sectionA => b.some(sectionB => {
    if (!checkedInB.includes(sectionB) && propertiesEqual(sectionA, sectionB)) {
      checkedInB.push(sectionB);
      return true;
    }
  }));

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
    for (const el of array1) {
      if (array2.indexOf(el) < 0) {
        return false;
      }
    }
    for (const el of array2) {
      if (array1.indexOf(el) < 0) {
        return false;
      }
    }
    return true;
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
  document.removeEventListener('stylishUpdate', onUpdateClicked);
  document.removeEventListener('stylishUpdateChrome', onUpdateClicked);
  document.removeEventListener('stylishUpdateOpera', onUpdateClicked);

  document.removeEventListener('stylishInstall', onInstallClicked);
  document.removeEventListener('stylishInstallChrome', onInstallClicked);
  document.removeEventListener('stylishInstallOpera', onInstallClicked);

  // we can't detach chrome.runtime.onMessage because it's no longer connected internally
  // we can destroy global functions in this context to free up memory
  [
    'checkUpdatability',
    'getMeta',
    'getResource',
    'onDOMready',
    'onInstallClicked',
    'onUpdateClicked',
    'orphanCheck',
    'saveStyleCode',
    'sendEvent',
    'styleSectionsEqual',
  ].forEach(fn => (window[fn] = null));
}
