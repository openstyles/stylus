'use strict';

var linter = (() => { // eslint-disable-line no-var
  const changeCallbacks = [];
  const linters = [];
  const cms = new Set();

  return {
    register,
    refresh,
    onChange,
    hook,
    unhook
  };

  function onChange(cb) {
    changeCallbacks.push(cb);
  }

  function onUpdateLinting(...args) {
    for (const cb of changeCallbacks) {
      cb(...args);
    }
  }

  function hook(cm) {
    cm.setOption('lint', {onUpdateLinting, getAnnotations});
    cms.add(cm);
  }

  function unhook(cm) {
    cm.setOption('lint', false);
    cms.delete(cm);
  }

  function register(getAnnotations) {
    linters.push(getAnnotations);
  }

  function refresh() {
    for (const cm of cms) {
      cm.performLint();
    }
  }

  function getAnnotations(...args) {
    const result = [];
    return Promise.all(linters.map(getAnnotations => getAnnotations(...args)))
      .then(results => {
        for (const annotations of results) {
          if (annotations) {
            result.push(...annotations);
          }
        }
        return result;
      });
  }
})();
