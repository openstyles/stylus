'use strict';

const {getBrowserlist} = require('./tools/util');

module.exports = {
  plugins: [
    'postcss-simple-vars',
    'postcss-nested', // see 'nesting-rules' comment
    ['postcss-preset-env', {
      browsers: getBrowserlist(),
      features: {
        'clamp': false, // used intentionally with a fallback
        'is-pseudo-class': {
          specificityMatchingName: 'Z',
        },
        /** disabling the built-in postcss-nesting plugin because is uses :is() for correctness,
         * but it requires postcss-is-pseudo-class plugin which emits warnings about our css,
         * so we use a different postcss-nested plugin that seemingly works just fine. */
        'nesting-rules': false,
        'prefers-color-scheme-query': false, // we manually handle it via cssRules
      },
    }],
  ],
};
