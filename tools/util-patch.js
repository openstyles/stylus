'use strict';

const webpack = require('webpack');

const escapeRe = s => s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');

const FILE1 = '/******/ (() => { // webpackBootstrap';
const FILE1_TO = '(global => {';
const FILE2 = '})()';
const FILE2_RE = new RegExp(escapeRe(FILE2) + '\\s*$');
const FILE2_TO = '})(this)';

const G1 = '/* webpack/runtime/global */';
const G2 = /* preserving linebreak after G1 */`
(() => {
  __webpack_require__.g = (function() {
    if (typeof globalThis === 'object') return globalThis;
    try {
      return this || new Function('return this')();
    } catch (e) {
      if (typeof window === 'object') return window;
    }
  })();
})();`;
const G2_PAD = G2.replace(/[^\r\n]/g, '');
const G2_RE = new RegExp(escapeRe(G2).replace(/\r?\n\s*/g, '[/*\\s]+'), 'y');
const G_TO = '__webpack_require__.g = global;';

class WebpackPatchBootstrapPlugin {
  apply(compiler) {
    const NAME = this.constructor.name;
    compiler.hooks.compilation.tap(NAME, compilation => {
      webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(compilation)
        .renderMain.tap(NAME, patchGlobal);
    });
  }
}

function patchGlobal(src) {
  let ch = src._children[0]; if (!ch) return;
  let str = ch._value;
  if (!str) return;
  const i = str.indexOf(G1); if (i < 0) return;

  if (!str.startsWith(FILE1)) return console.error(`Expected at start: ${FILE1}`);
  G2_RE.lastIndex = i + G1.length;
  let m = str.match(G2_RE);
  if (!m) return console.error(`Expected after ${G1}: ${G2}`);

  ch._value = ch._valueAsString =
    FILE1_TO + str.slice(FILE1.length, i) +
    G_TO + G2_PAD + str.slice(i + G1.length + m[0].length);

  str = (ch = src._children.at(-1))._value;
  m = str.match(FILE2_RE);
  if (!m) return console.error(`Expected at end: ${FILE2}`);
  ch._value = ch._valueAsString = str.slice(0, -m[0].length) + FILE2_TO;
}

module.exports = WebpackPatchBootstrapPlugin;
