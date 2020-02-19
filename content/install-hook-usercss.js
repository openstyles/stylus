'use strict';

// preventing reregistration if reinjected by tabs.executeScript for whatever reason, just in case
if (typeof self.oldCode !== 'string') {
  self.oldCode = (document.querySelector('body > pre') || document.body).textContent;
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'downloadSelf') return;
    port.onMessage.addListener(({id, timer}) => {
      fetch(location.href, {mode: 'same-origin'})
        .then(r => r.text())
        .then(code => ({id, code: timer && code === self.oldCode ? null : code}))
        .catch(error => ({id, error: error.message || `${error}`}))
        .then(msg => {
          port.postMessage(msg);
          if (msg.code != null) self.oldCode = msg.code;
        });
    });
  });
}

// passing the result to tabs.executeScript
self.oldCode; // eslint-disable-line no-unused-expressions
