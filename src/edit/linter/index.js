import {cms, linters, lintingUpdatedListeners, unhookListeners} from './store';
import './engines';

export * from './defaults';
export * from './reports';

export function disableForEditor(cm) {
  cm.setOption('lint', false);
  cms.delete(cm);
  for (const cb of unhookListeners) {
    cb(cm);
  }
}

/**
 * @param {Object} cm
 * @param {string} [code] - to be used to avoid slowdowns when creating a lot of cms.
 * Enables lint option only if there are problems, thus avoiding a _very_ costly layout
 * update when lint gutter is added to a lot of editors simultaneously.
 */
export function enableForEditor(cm, code) {
  if (cms.has(cm)) return;
  cms.set(cm, null);
  if (code) {
    enableOnProblems(cm, code);
  } else {
    cm.setOption('lint', {getAnnotations, onUpdateLinting});
  }
}

export function onLintingUpdated(fn) {
  lintingUpdatedListeners.push(fn);
}

export function onUnhook(fn) {
  unhookListeners.push(fn);
}

export function register(fn) {
  linters.push(fn);
}

export function run() {
  for (const cm of cms.keys()) {
    cm.performLint();
  }
}

async function enableOnProblems(cm, code) {
  const results = await getAnnotations(code, {}, cm);
  if (results.length || cm.display.renderedView) {
    cms.set(cm, results);
    cm.setOption('lint', {getAnnotations: getCachedAnnotations, onUpdateLinting});
  } else {
    cms.delete(cm);
  }
}

async function getAnnotations(...args) {
  const results = await Promise.all(linters.map(fn => fn(...args)));
  return [].concat(...results.filter(Boolean));
}

function getCachedAnnotations(code, opt, cm) {
  const results = cms.get(cm);
  cms.set(cm, null);
  cm.state.lint.options.getAnnotations = getAnnotations;
  return results;
}

function onUpdateLinting(...args) {
  for (const fn of lintingUpdatedListeners) {
    fn(...args);
  }
}
