/* global runtimeSend */
'use strict';

function createSourceLoader() {
  let source;

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

  function load() {
    return fetchText(location.href).then(newSource => {
      source = newSource;
      return source;
    });
  }

  function watch(cb) {
    let timer;
    const DELAY = 1000;

    function start() {
      if (timer) {
        return;
      }
      timer = setTimeout(check, DELAY);
    }

    function stop() {
      clearTimeout(timer);
      timer = null;
    }

    function check() {
      fetchText(location.href)
        .then(newSource => {
          if (source !== newSource) {
            source = newSource;
            return cb(source);
          }
        })
        .catch(console.log)
        .then(() => {
          timer = setTimeout(check, DELAY);
        });
    }

    return {start, stop};
  }

  return {load, watch, source: () => source};
}

function initUsercssInstall() {
  const sourceLoader = createSourceLoader();
  const pendingSource = sourceLoader.load();
  let watcher;

  chrome.runtime.onConnect.addListener(port => {
    // FIXME: is this the correct way to reject a connection?
    // https://developer.chrome.com/extensions/messaging#connect
    console.assert(port.name === 'usercss-install');

    port.onMessage.addListener(msg => {
      switch (msg.method) {
        case 'getSourceCode':
          pendingSource
            .then(sourceCode => port.postMessage({method: msg.method + 'Response', sourceCode}))
            .catch(err => port.postMessage({method: msg.method + 'Response', error: err.message || String(err)}));
          break;

        case 'liveReloadStart':
          if (!watcher) {
            watcher = sourceLoader.watch(sourceCode => {
              port.postMessage({method: 'sourceCodeChanged', sourceCode});
            });
          }
          watcher.start();
          break;

        case 'liveReloadStop':
          watcher.stop();
          break;

        case 'closeTab':
          if (history.length > 1) {
            history.back();
          } else {
            runtimeSend({method: 'closeTab'});
          }
          break;
      }
    });
  });
  return runtimeSend({
    method: 'openUsercssInstallPage',
    updateUrl: location.href
  }).catch(alert);
}

function isUsercss() {
  if (!/text\/(css|plain)/.test(document.contentType)) {
    return false;
  }
  if (!/==userstyle==/i.test(document.body.textContent)) {
    return false;
  }
  return true;
}

if (isUsercss()) {
  initUsercssInstall();
}
