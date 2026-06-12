export let parserlib, stylusLang;

export const {importScripts} = global;
export const load = (file, name) => importScripts(file) || global[name];
export const loadParserlib = () =>
  (parserlib = load('parserlib.js', 'parserlib'));
export const loadStylusLang = () =>
  (stylusLang = load('stylus-lang.js', 'stylus'));
