/* global editor */

'use strict';

let uswPort;

/* exported linkToUSW */
function linkToUSW() {
  if (!uswPort) {
    uswPort = chrome.runtime.connect({name: 'link-style-usw'});
    uswPort.onDisconnect.addListener(err => {
      throw err;
    });
  }
  uswPort.postMessage(editor.style);
}
