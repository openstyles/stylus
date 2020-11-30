'use strict';

define(require => {
  const {debounce} = require('/js/toolbox');
  const {CodeMirror} = require('./codemirror-factory');
  const editor = require('./editor');

  // reroute handling to nearest editor when keypress resolves to one of these commands
  const REROUTED = new Set([
    'beautify',
    'colorpicker',
    'find',
    'findNext',
    'findPrev',
    'jumpToLine',
    'nextEditor',
    'prevEditor',
    'replace',
    'replaceAll',
    'save',
    'toggleEditorFocus',
    'toggleStyle',
  ]);

  return function rerouteHotkeys(enable, immediately) {
    if (!immediately) {
      debounce(rerouteHotkeys, 0, enable, true);
    } else {
      document[enable ? 'on' : 'off']('keydown', rerouteHandler);
    }
  };

  function rerouteHandler(event) {
    const keyName = CodeMirror.keyName(event);
    if (!keyName) {
      return;
    }
    const rerouteCommand = name => {
      if (REROUTED.has(name)) {
        CodeMirror.commands[name](editor.closestVisible(event.target));
        return true;
      }
    };
    if (CodeMirror.lookupKey(keyName, CodeMirror.defaults.keyMap, rerouteCommand) === 'handled' ||
        CodeMirror.lookupKey(keyName, CodeMirror.defaults.extraKeys, rerouteCommand) === 'handled') {
      event.preventDefault();
      event.stopPropagation();
    }
  }
});
