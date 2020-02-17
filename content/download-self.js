'use strict';

// preventing reinjection by tabs.executeScript, just in case
typeof self.oldCode !== 'string' && // eslint-disable-line no-unused-expressions
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'downloadSelf') return;
  const read = r => r.status === 200 ? r.text() : Promise.reject(r.status);
  const wrapError = error => ({error});
  const postBack = msg => {
    port.postMessage(msg);
    self.oldCode = msg.code;
  };
  port.onMessage.addListener(cmd => {
    const oldCode = cmd === 'timer' ? self.oldCode : '';
    fetch(location.href, {mode: 'same-origin'})
      .then(read)
      .then(code => ({code: code === oldCode ? '' : code}), wrapError)
      .then(postBack);
  });
});

// this assignment also passes the result to tabs.executeScript
self.oldCode = (document.querySelector('body > pre') || document.body).textContent;
