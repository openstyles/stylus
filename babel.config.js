'use strict';

const {getBrowserlist} = require('./tools/util');

module.exports = {
  targets: getBrowserlist(),
  assumptions: {
    constantReexports: true,
    noDocumentAll: true,
    noIncompleteNsImportDetection: true,
    noNewArrows: true,
    privateFieldsAsSymbols: true,
  },
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: false,
      modules: false,
    }],
  ],
  plugins: [
    // '@babel/plugin-transform-runtime',
    // ['transform-modern-regexp', {useRe: true}], // TODO: use for complex regexps
  ],
};
