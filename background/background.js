'use strict';

define(require => {
  const {FIREFOX} = require('/js/toolbox');
  const {API, msg} = require('/js/msg');
  const styleManager = require('./style-manager');
  require('./background-api');

  // These are loaded conditionally.
  // Each item uses `require` individually so IDE can jump to the source and track usage.
  Promise.all([
    FIREFOX &&
      require(['./style-via-api']),
    FIREFOX && ((browser.commands || {}).update) &&
      require(['./browser-cmd-hotkeys']),
    !FIREFOX &&
      require(['./content-scripts']),
    !FIREFOX &&
      require(['./style-via-webrequest']),
    chrome.contextMenus &&
      require(['./context-menus']),
    styleManager.ready,
  ]).then(() => {
    msg.isBgReady = true;
    msg.broadcast({method: 'backgroundReady'});
  });

  if (chrome.commands) {
    chrome.commands.onCommand.addListener(id => API.browserCommands[id]());
  }

  chrome.runtime.onInstalled.addListener(({reason, previousVersion}) => {
    if (reason !== 'update') return;
    const [a, b, c] = (previousVersion || '').split('.');
    if (a <= 1 && b <= 5 && c <= 13) { // 1.5.13
      require(['./remove-unused-storage']);
    }
  });
});
