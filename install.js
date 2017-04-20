'use strict';

document.addEventListener('stylishUpdateChrome', onUpdateClicked);
document.addEventListener('stylishInstallChrome', onInstallClicked);

new MutationObserver(waitForBody)
  .observe(document.documentElement, {childList: true});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // orphaned content script check
  if (msg.method == 'ping') {
    sendResponse(true);
  }
});


function waitForBody() {
  if (!document.body) {
    return;
  }
  this.disconnect();

  rebrand([{addedNodes: [document.body]}]);
  new MutationObserver(rebrand)
    .observe(document.body, {childList: true, subtree: true});

  chrome.runtime.sendMessage({
    method: 'getStyles',
    url: getMeta('stylish-id-url') || location.href
  }, checkUpdatability);
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
    getResource(getMeta('stylish-code-chrome')).then(code => {
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
  if (!orphanCheck()) {
    return;
  }
  getResource(getMeta('stylish-description'))
    .then(name => saveStyleCode('styleInstall', name))
    .then(() => getResource(getMeta('stylish-install-ping-url-chrome')));
}


function onUpdateClicked() {
  if (!orphanCheck()) {
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
    getResource(getMeta('stylish-code-chrome')).then(code => {
      chrome.runtime.sendMessage(
        Object.assign(JSON.parse(code), addProps, {method: 'saveStyle'}),
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


function rebrand(mutations, observer) {
  /* stylish to stylus; https://github.com/schomery/stylish-chrome/issues/12 */
  if (!document.getElementById('hidden-meta') && document.readyState == 'loading') {
    return;
  }
  observer.disconnect();
  const elements = document.getElementsByClassName('install-status');
  for (let i = elements.length; --i >= 0;) {
    const walker = document.createTreeWalker(elements[i], NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue;
      const parent = node.parentNode;
      const extensionHelp = /stylish_chrome/.test(parent.href);
      if (text.includes('Stylish') && (parent.localName != 'a' || extensionHelp)) {
        node.nodeValue = text.replace(/Stylish/g, 'Stylus');
      }
      if (extensionHelp) {
        parent.href = 'http://add0n.com/stylus.html';
      }
    }
  }
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
  document.removeEventListener('stylishUpdateChrome', onUpdateClicked);
  document.removeEventListener('stylishInstallChrome', onInstallClicked);
  // we can't detach chrome.runtime.onMessage because it's no longer connected internally
  // we can destroy global functions in this context to free up memory
  [
    'checkUpdatability',
    'getMeta',
    'getResource',
    'onInstallClicked',
    'onUpdateClicked',
    'orphanCheck',
    'rebrand',
    'saveStyleCode',
    'sendEvent',
    'styleSectionsEqual',
    'waitForBody',
  ].forEach(fn => (window[fn] = null));
}
