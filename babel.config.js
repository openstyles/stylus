'use strict';

const {getBrowserlist} = require('./tools/util');

module.exports = {
  targets: getBrowserlist(),
  assumptions: {
    constantReexports: true,
    noDocumentAll: true,
    noIncompleteNsImportDetection: true,
    noNewArrows: true,
    objectRestNoSymbols: true,
    privateFieldsAsSymbols: true,
  },
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: false,
      bugfixes: true,
      loose: true,
      modules: false,
    }],
  ],
  plugins: [
    // ['babel-plugin-inline-constants', {modules: ['./src/js/consts.js']}],
    // '@babel/plugin-transform-runtime',
    // ['transform-modern-regexp', {useRe: true}], // TODO: use for complex regexps
  ],
};
