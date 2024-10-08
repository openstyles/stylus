'use strict';

const mj = require('./src/manifest.json');

module.exports = {
  plugins: [
    ['postcss-preset-env', {
      browsers: [
        'Firefox >= ' + mj.browser_specific_settings.gecko.strict_min_version,
        'Chrome >= ' + mj.minimum_chrome_version,
      ].join(','),
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
