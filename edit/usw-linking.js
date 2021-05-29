/* global $ */// dom.js
/* global editor */

'use strict';

let uswPort;

function connectToPort() {
  if (!uswPort) {
    uswPort = chrome.runtime.connect({name: 'link-style-usw'});
    uswPort.onDisconnect.addListener(err => {
      throw err;
    });
  }
}

/* exported linkToUSW */
function linkToUSW() {
  connectToPort();

  uswPort.postMessage({reason: 'link', data: editor.style});
}

/* exported revokeLinking */
function revokeLinking() {
  connectToPort();

  uswPort.postMessage({reason: 'revoke', data: editor.style});
}


/* exported updateUI */
function updateUI(useStyle) {
  const style = useStyle || editor.style;
  if (style._uswToken) {
    $('#after-linking').style = '';
    $('#pre-linking').style = 'display: none;';
  } else {
    $('#after-linking').style = 'display: none;';
    $('#pre-linking').style = '';
  }
}
