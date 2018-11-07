/* global CodeMirror editor debounce */
/* exported rerouteHotkeys */
'use strict';

const rerouteHotkeys = (() => {
  // reroute handling to nearest editor when keypress resolves to one of these commands
  const REROUTED = new Set([
    'save',
    'toggleStyle',
    'jumpToLine',
    'nextEditor', 'prevEditor',
    'toggleEditorFocus',
    'find', 'findNext', 'findPrev', 'replace', 'replaceAll',
    'colorpicker',
  ]);

  return rerouteHotkeys;

  // note that this function relies on `editor`. Calling this function before
  // the editor is initialized may throw an error.
  function rerouteHotkeys(enable, immediately) {
    if (!immediately) {
      debounce(rerouteHotkeys, 0, enable, true);
    } else if (enable) {
      document.addEventListener('keydown', rerouteHandler);
    } else {
      document.removeEventListener('keydown', rerouteHandler);
    }
  }

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
})();
