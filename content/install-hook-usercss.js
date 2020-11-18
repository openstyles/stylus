'use strict';

// preventing reregistration if reinjected by tabs.executeScript for whatever reason, just in case
if (typeof window.oldCode !== 'string') {
  window.oldCode = (document.querySelector('body > pre') || document.body).textContent;
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'downloadSelf') return;
    port.onMessage.addListener(async ({id, force}) => {
      const msg = {id};
      try {
        const code = await (await fetch(location.href, {mode: 'same-origin'})).text();
        if (code !== window.oldCode || force) {
          msg.code = window.oldCode = code;
        }
      } catch (error) {
        msg.error = error.message || `${error}`;
      }
      port.postMessage(msg);
    });
    // FF keeps content scripts connected on navigation https://github.com/openstyles/stylus/issues/864
    addEventListener('pagehide', () => port.disconnect(), {once: true});
  });
}

// passing the result to tabs.executeScript
window.oldCode; // eslint-disable-line no-unused-expressions
