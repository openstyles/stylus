/* global prefs */
'use strict';

/* exported linter */
const linter = (() => {
  const lintingUpdatedListeners = [];
  const unhookListeners = [];
  const linters = [];
  const cms = new Set();

  return {
    register,
    run,
    enableForEditor,
    disableForEditor,
    onLintingUpdated,
    onUnhook
  };

  function onUnhook(cb) {
    unhookListeners.push(cb);
  }

  function onLintingUpdated(cb) {
    lintingUpdatedListeners.push(cb);
  }

  function onUpdateLinting(...args) {
    for (const cb of lintingUpdatedListeners) {
      cb(...args);
    }
  }

  function enableForEditor(cm) {
    cm.setOption('lint', {onUpdateLinting, getAnnotations});
    cms.add(cm);
  }

  function disableForEditor(cm) {
    cm.setOption('lint', false);
    cms.delete(cm);
    for (const cb of unhookListeners) {
      cb(cm);
    }
  }

  function register(linterFn) {
    linters.push(linterFn);
  }

  function run() {
    for (const cm of cms) {
      cm.performLint();
    }
  }

  function getAnnotations(...args) {
    return Promise.all(linters.map(fn => fn(...args)))
      .then(results => [].concat(...results.filter(Boolean)));
  }
})();

// FIXME: this should be put inside edit.js
prefs.subscribe(['editor.linter'], () => {
  linter.run();
});
