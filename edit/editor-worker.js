/* global importScripts workerUtil CSSLint require metaParser */
'use strict';

importScripts('/js/worker-util.js');
const {createAPI, loadScript} = workerUtil;

createAPI({
  csslint: (code, config) => {
    loadScript('/vendor-overwrites/csslint/parserlib.js', '/vendor-overwrites/csslint/csslint.js');
    return CSSLint.verify(code, config).messages
      .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
  },
  stylelint: (code, config) => {
    loadScript('/vendor/stylelint-bundle/stylelint-bundle.min.js');
    return require('stylelint').lint({code, config});
  },
  metalint: code => {
    loadScript(
      '/js/polyfill.js',
      '/vendor/usercss-meta/usercss-meta.min.js',
      '/vendor-overwrites/colorpicker/colorconverter.js',
      '/js/meta-parser.js'
    );
    const result = metaParser.lint(code);
    // extract needed info
    result.errors = result.errors.map(err =>
      ({
        code: err.code,
        args: err.args,
        message: err.message,
        index: err.index
      })
    );
    return result;
  },
  getStylelintRules,
  getCsslintRules
});

function getCsslintRules() {
  loadScript('/vendor-overwrites/csslint/csslint.js');
  return CSSLint.getRules().map(rule => {
    const output = {};
    for (const [key, value] of Object.entries(rule)) {
      if (typeof value !== 'function') {
        output[key] = value;
      }
    }
    return output;
  });
}

function getStylelintRules() {
  loadScript('/vendor/stylelint-bundle/stylelint-bundle.min.js');
  const stylelint = require('stylelint');
  const options = {};
  const rxPossible = /\bpossible:("(?:[^"]*?)"|\[(?:[^\]]*?)\]|\{(?:[^}]*?)\})/g;
  const rxString = /"([-\w\s]{3,}?)"/g;
  for (const id of Object.keys(stylelint.rules)) {
    const ruleCode = String(stylelint.rules[id]);
    const sets = [];
    let m, mStr;
    while ((m = rxPossible.exec(ruleCode))) {
      const possible = m[1];
      const set = [];
      while ((mStr = rxString.exec(possible))) {
        const s = mStr[1];
        if (s.includes(' ')) {
          set.push(...s.split(/\s+/));
        } else {
          set.push(s);
        }
      }
      if (possible.includes('ignoreAtRules')) {
        set.push('ignoreAtRules');
      }
      if (possible.includes('ignoreShorthands')) {
        set.push('ignoreShorthands');
      }
      if (set.length) {
        sets.push(set);
      }
    }
    if (sets.length) {
      options[id] = sets;
    }
  }
  return options;
}
