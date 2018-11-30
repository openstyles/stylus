/* global API */
'use strict';

(() => {
  // some weird bug in new Chrome: the content script gets injected multiple times
  if (typeof window.initUsercssInstall === 'function') return;
  if (!/text\/(css|plain)/.test(document.contentType) ||
      !/==userstyle==/i.test(document.body.textContent)) {
    return;
  }
  window.initUsercssInstall = () => {};

  orphanCheck();

  const DELAY = 500;
  const url = location.href;
  let sourceCode, port, timer;

  chrome.runtime.onConnect.addListener(onConnected);
  API.openUsercssInstallPage({url})
    .catch(err => alert(err));

  function onConnected(newPort) {
    port = newPort;
    port.onDisconnect.addListener(stop);
    port.onMessage.addListener(onMessage);
  }

  function onMessage(msg, port) {
    switch (msg.method) {
      case 'getSourceCode':
        fetchText(url)
          .then(text => {
            sourceCode = sourceCode || text;
            port.postMessage({
              method: msg.method + 'Response',
              sourceCode,
            });
          })
          .catch(err => port.postMessage({
            method: msg.method + 'Response',
            error: err.message || String(err),
          }));
        break;

      case 'liveReloadStart':
        start();
        break;

      case 'liveReloadStop':
        stop();
        break;
    }
  }

  function fetchText(url) {
    // XHR throws in Chrome 49
    // FIXME: choose a correct version
    // https://github.com/openstyles/stylus/issues/560
    if (getChromeVersion() <= 49) {
      return fetch(url)
        .then(r => r.text())
        .catch(() => fetchTextXHR(url));
    }
    return fetchTextXHR(url);
  }

  function fetchTextXHR(url) {
    return new Promise((resolve, reject) => {
      // you can't use fetch in Chrome under 'file:' protocol
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.addEventListener('load', () => resolve(xhr.responseText));
      xhr.addEventListener('error', () => reject(xhr));
      xhr.send();
    });
  }

  function getChromeVersion() {
    const match = navigator.userAgent.match(/chrome\/(\d+)/i);
    return match ? Number(match[1]) : undefined;
  }

  function start() {
    timer = timer || setTimeout(check, DELAY);
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function check() {
    fetchText(url)
      .then(text => {
        if (sourceCode === text) return;
        sourceCode = text;
        port.postMessage({method: 'sourceCodeChanged', sourceCode});
      })
      .catch(error => {
        console.log(chrome.i18n.getMessage('liveReloadError', error));
      })
      .then(() => {
        timer = null;
        start();
      });
  }

  function orphanCheck() {
    const eventName = chrome.runtime.id + '-install-hook-usercss';
    const orphanCheckRequest = () => {
      if (chrome.i18n && chrome.i18n.getUILanguage()) return true;
      // In Chrome content script is orphaned on an extension update/reload
      // so we need to detach event listeners
      removeEventListener(eventName, orphanCheckRequest, true);
      try {
        chrome.runtime.onConnect.removeListener(onConnected);
      } catch (e) {}
    };
    dispatchEvent(new Event(eventName));
    addEventListener(eventName, orphanCheckRequest, true);
  }
})();
