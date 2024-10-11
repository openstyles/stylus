'use strict';

const {getBrowserlist} = require('./tools/util');

module.exports = {
  targets: getBrowserlist(),
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: false,
      bugfixes: true,
      loose: true,
    }],
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    // ['transform-modern-regexp', {useRe: true}], // TODO: use for complex regexps
  ],
};
