/* global importScripts parseMozFormat parserlib CSSLint require */
'use strict';

createAPI({
  csslint: (code, config) => {
    loadParserLib();
    loadScript(['/vendor-overwrites/csslint/csslint.js']);
    return CSSLint.verify(code, config).messages
      .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
  },
  stylelint: (code, config) => {
    loadScript(['/vendor/stylelint-bundle/stylelint-bundle.min.js']);
    return require('stylelint').lint({code, config});
  },
  parseMozFormat: data => {
    loadParserLib();
    loadScript(['/js/moz-parser.js']);
    return parseMozFormat(data);
  },
  getStylelintRules,
  getCsslintRules
});

function getCsslintRules() {
  loadScript(['/vendor-overwrites/csslint/csslint.js']);
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
  loadScript(['/vendor/stylelint-bundle/stylelint-bundle.min.js']);
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

function loadParserLib() {
  if (typeof parserlib !== 'undefined') {
    return;
  }
  importScripts('/vendor-overwrites/csslint/parserlib.js');
  parserlib.css.Tokens[parserlib.css.Tokens.COMMENT].hide = false;
}

const loadedUrls = new Set();
function loadScript(urls) {
  urls = urls.filter(u => !loadedUrls.has(u));
  importScripts(...urls);
  urls.forEach(u => loadedUrls.add(u));
}

function createAPI(methods) {
  self.onmessage = e => {
    const message = e.data;
    Promise.resolve()
      .then(() => methods[message.action](...message.args))
      .then(result => ({
        id: message.id,
        error: false,
        data: result
      }))
      .catch(err => ({
        id: message.id,
        error: true,
        data: cloneError(err)
      }))
      .then(data => self.postMessage(data));
  };
}

function cloneError(err) {
  return Object.assign({
    name: err.name,
    stack: err.stack,
    message: err.message,
    lineNumber: err.lineNumber,
    columnNumber: err.columnNumber,
    fileName: err.fileName
  }, err);
}
