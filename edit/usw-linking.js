/* global $ $create $remove */// dom.js
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

/* exported uploadStyle */
function uploadStyle() {
  connectToPort();
  const data = Object.assign(editor.style, {sourceCode: editor.getEditors()[0].getValue()});
  uswPort.postMessage({reason: 'upload', data});
}


/* exported updateUI */
function updateUI(useStyle) {
  const style = useStyle || editor.style;
  if (style._usw && style._usw.token) {
    const afterLinking = $('#after-linking');
    afterLinking.style = '';
    $('#pre-linking').style = 'display: none;';

    const linkInformation = $create('div', {id: 'link-info'}, [
      $create('p', `Style name: ${style._usw.name}`),
      $create('p', `Description: ${style._usw.description}`),
    ]);
    $remove('#link-info');
    afterLinking.insertBefore(linkInformation, afterLinking.firstChild);
  } else {
    $('#after-linking').style = 'display: none;';
    $('#pre-linking').style = '';
  }
}
