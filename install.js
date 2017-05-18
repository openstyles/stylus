'use strict';

const FIREFOX = /Firefox/.test(navigator.userAgent);
const VIVALDI = /Vivaldi/.test(navigator.userAgent);
const OPERA = /OPR/.test(navigator.userAgent);

document.addEventListener("stylishUpdate", onUpdateClicked);
document.addEventListener("stylishUpdateChrome", onUpdateClicked);
document.addEventListener("stylishUpdateOpera", onUpdateClicked);

document.addEventListener("stylishInstall", onInstallClicked);
document.addEventListener("stylishInstallChrome", onInstallClicked);
document.addEventListener("stylishInstallOpera", onInstallClicked);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // orphaned content script check
  if (msg.method == 'ping') {
    sendResponse(true);
  }
});

new MutationObserver((mutations, observer) => {
  if (document.body) {
    observer.disconnect();
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
function getStyleURL () {
  const url = getMeta('stylish-code-chrome');

  if (FIREFOX || OPERA || VIVALDI) {
    /* get custom settings from the update url */
    return Object.assign(new URL(url), {
      search: (new URL(getMeta('stylish-update-url'))).search
    }).href;
  }
  return url;
}

function checkUpdatability([installedStyle]) {
  if (!installedStyle) {
    sendEvent('styleCanBeInstalledChrome');
    return;
  }
  const md5Url = getMeta('stylish-md5-url');
  if (md5Url && installedStyle.md5Url && installedStyle.originalMd5) {
    getResource(md5Url).then(md5 => {
      reportUpdatable(md5 != installedStyle.originalMd5);
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
  }
  else if (OPERA || VIVALDI) {
    type = type.replace('Chrome', 'Opera');
  }
  detail = {detail};
  if (typeof cloneInto != 'undefined') {
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

    getResource(getStyleURL()).then(code => {
      chrome.runtime.sendMessage(
        Object.assign(JSON.parse(code), addProps, {
          method: 'saveStyle',
          reason: 'update',
        }),
        () => sendEvent('styleInstalledChrome')
      );
      resolve();
    });
  });
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
  if (a.length != b.length) {
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
    return equalOrEmpty(secA.code, secB.code, 'substr', (a, b) => a == b);
  }

  function equalOrEmpty(a, b, telltale, comparator) {
    const typeA = a && typeof a[telltale] == 'function';
    const typeB = b && typeof b[telltale] == 'function';
    return (
      (a === null || a === undefined || (typeA && !a.length)) &&
      (b === null || b === undefined || (typeB && !b.length))
    ) || typeA && typeB && a.length == b.length && comparator(a, b);
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
  if (document.readyState != 'loading') {
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
  document.removeEventListener("stylishUpdate", onUpdateClicked);
  document.removeEventListener("stylishUpdateChrome", onUpdateClicked);
  document.removeEventListener("stylishUpdateOpera", onUpdateClicked);

  document.removeEventListener("stylishInstall", onInstallClicked);
  document.removeEventListener("stylishInstallChrome", onInstallClicked);
  document.removeEventListener("stylishInstallOpera", onInstallClicked);

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
