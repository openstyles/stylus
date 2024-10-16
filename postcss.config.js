'use strict';

const {getBrowserlist} = require('./tools/util');

module.exports = {
  plugins: [
    ['postcss-preset-env', {
      browsers: getBrowserlist(),
      features: {
        'clamp': false, // used intentionally with a fallback
        'prefers-color-scheme-query': false, // we manually handle it via cssRules
      },
    }],
    'postcss-simple-vars',
    'postcss-nested',
    'autoprefixer',
  ],
};
