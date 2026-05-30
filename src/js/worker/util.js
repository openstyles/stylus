export let CSSLint, parserlib, stylelint;

export const {importScripts} = global;
export const load = (file, name) => importScripts(file) || global[name];
export const loadCSSLint = () => (parserlib || loadParserlib()) &&
  (CSSLint = load('csslint.js', 'CSSLint'));
export const loadParserlib = () =>
  (parserlib = load('parserlib.js', 'parserlib'));
export const loadStylelint = () =>
  (stylelint = load('stylelint.js', 'stylelint'));
