/* global workerUtil */
'use strict';

/* exported editorWorker */
/** @type {EditorWorker} */
const editorWorker = workerUtil.createWorker({
  url: '/edit/editor-worker.js',
});

/* exported linter */
const linter = (() => {
  const lintingUpdatedListeners = [];
  const unhookListeners = [];
  const linters = [];
  const cms = new Set();

  return {
    disableForEditor(cm) {
      cm.setOption('lint', false);
      cms.delete(cm);
      for (const cb of unhookListeners) {
        cb(cm);
      }
    },
    /**
     * @param {Object} cm
     * @param {string} [code] - to be used to avoid slowdowns when creating a lot of cms.
     * Enables lint option only if there are problems, thus avoiding a _very_ costly layout
     * update when lint gutter is added to a lot of editors simultaneously.
     */
    enableForEditor(cm, code) {
      if (code) return enableOnProblems(cm, code);
      cm.setOption('lint', {getAnnotations, onUpdateLinting});
      cms.add(cm);
    },
    onLintingUpdated(cb) {
      lintingUpdatedListeners.push(cb);
    },
    onUnhook(cb) {
      unhookListeners.push(cb);
    },
    register(linterFn) {
      linters.push(linterFn);
    },
    run() {
      for (const cm of cms) {
        cm.performLint();
      }
    },
  };

  async function enableOnProblems(cm, code) {
    const results = await getAnnotations(code, {}, cm);
    if (results.length) {
      cms.add(cm);
      cm.setOption('lint', {
        getAnnotations() {
          cm.options.lint.getAnnotations = getAnnotations;
          return results;
        },
        onUpdateLinting,
      });
    }
  }

  async function getAnnotations(...args) {
    const results = await Promise.all(linters.map(fn => fn(...args)));
    return [].concat(...results.filter(Boolean));
  }

  function onUpdateLinting(...args) {
    for (const cb of lintingUpdatedListeners) {
      cb(...args);
    }
  }
})();
