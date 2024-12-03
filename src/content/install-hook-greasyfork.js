/* global API */// msg.js
'use strict'; // eslint-disable-line strict

// onCommitted may fire twice
// Note, we're checking against a literal `1`, not just `if (truthy)`,
// because <html id="INJECTED"> is exposed per HTML spec as a global variable and `window.INJECTED`.

if (window.INJECTED_GREASYFORK !== 1) {
  window.INJECTED_GREASYFORK = 1;
  addEventListener('message', async function onMessage(e) {
    if (e.origin === location.origin &&
        e.data &&
        e.data.name &&
        e.data.type === 'style-version-query') {
      removeEventListener('message', onMessage);
      postMessage({
        type: 'style-version',
        version: await API.usercss.getVersion(e.data),
      }, '*');
    }
  });
}
