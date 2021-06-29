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


/* exported revokeLinking */
function revokeLinking() {
  connectToPort();

  uswPort.postMessage({reason: 'revoke', data: editor.style});
}

/* exported publishStyle */
function publishStyle() {
  connectToPort();
  const data = Object.assign(editor.style, {sourceCode: editor.getEditors()[0].getValue()});
  uswPort.postMessage({reason: 'publish', data});
}


/* exported updateUI */
function updateUI(useStyle) {
  const style = useStyle || editor.style;
  if (style._usw && style._usw.token) {
    $('#revoke-link').style = '';

    const linkInformation = $create('div', {id: 'link-info'}, [
      $create('p', `Style name: ${style._usw.name}`),
      $create('p', `Description: ${style._usw.description}`),
    ]);
    $remove('#link-info');
    $('#integration').insertBefore(linkInformation, $('#integration').firstChild);
  } else {
    $('#revoke-link').style = 'display: none;';
    $remove('#link-info');
  }
}
