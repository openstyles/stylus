'use strict';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    // you can't use fetch in Chrome under 'file:' protocol
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.addEventListener('load', () => resolve(xhr.responseText));
    xhr.addEventListener('error', () => reject(xhr));
    xhr.send();
  });
}

function install(style) {
  const request = Object.assign(style, {
    method: 'saveUsercss',
    reason: 'install',
    url: location.href,
    updateUrl: location.href
  });
  return communicate(request);
}

function communicate(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, result => {
      if (result.status === 'error') {
        reject(result.error);
      } else {
        resolve(result);
      }
    });
  });
}

function initUsercssInstall() {
  fetchText(location.href).then(source =>
    communicate({
      method: 'filterUsercss',
      source: source,
      checkDup: true
    })
  ).then(({style, dup}) => {
    if (dup) {
      if (confirm(chrome.i18n.getMessage('styleInstallOverwrite', [style.name, dup.version, style.version]))) {
        return install(style);
      }
    } else if (confirm(chrome.i18n.getMessage('styleInstall', [style.name]))) {
      return install(style);
    }
  }).catch(err => {
    alert(chrome.i18n.getMessage('styleInstallFailed', String(err)));
  });
}

function isUsercss() {
  if (!/\.user\.(css|styl|less|scss|sass)$/i.test(location.pathname)) {
    return false;
  }
  if (!/text\/(css|plain)/.test(document.contentType)) {
    return false;
  }
  if (!/==userstyle==/i.test(document.body.textContent)) {
    return false;
  }
  return true;
}

if (isUsercss()) {
  // It seems that we need to wait some time to redraw the page.
  setTimeout(initUsercssInstall, 500);
}
