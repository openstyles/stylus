import {pLintReportDelay} from '@/js/consts';
import {__values} from '@/js/prefs';
import {cms, linters, lintingUpdatedListeners, unhookListeners} from './store';
import './engines';

export * from './reports';

export function disableForEditor(cm) {
  setCmLintOption(cm, false);
  cms.delete(cm);
  for (const cb of unhookListeners) {
    cb(cm);
  }
}

function setCmLintOption(cm, fn) {
  cm.setOption('lint', fn && {
    delay: __values[pLintReportDelay],
    getAnnotations: fn,
    onUpdateLinting,
  });
}

/**
 * @param {Object} cm
 * @param {string} [code] - to be used to avoid slowdowns when creating a lot of cms.
 * Enables lint option only if there are problems, thus avoiding a _very_ costly layout
 * update when lint gutter is added to a lot of editors simultaneously.
 * @param {boolean} [force] - set the option anyway e.g. in single editor mode
 */
export function enableForEditor(cm, code, force) {
  if (cms.has(cm)) return;
  cms.set(cm, null);
  if (code) {
    enableOnProblems(cm, code, force);
  } else {
    setCmLintOption(cm, getAnnotations);
  }
}

export function run() {
  for (const cm of cms.keys()) {
    cm.performLint();
  }
}

async function enableOnProblems(cm, code, force) {
  const results = await getAnnotations(code, {}, cm);
  if (force || results.length || cm.display.renderedView) {
    cms.set(cm, results);
    setCmLintOption(cm, getCachedAnnotations);
  } else {
    cms.delete(cm);
  }
}

function getAnnotations(code, options, cm) {
  const jobs = Array.from(linters, fn => fn(code, options, cm)).filter(Boolean);
  return !jobs.length ? jobs : Promise.all(jobs).then(results => results.filter(Boolean).flat());
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
