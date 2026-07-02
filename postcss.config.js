'use strict';

const {getBrowserlist, getBrowserTargets} = require('./tools/util');
const targets = Object.fromEntries(getBrowserTargets());
/** Inverted condition to ignore NaN target when building for a specific target */
const nesting = !(targets.chrome < 120 || targets.firefox < 117);
const kPostcssNested = 'postcss-nested';
const plugins = [
  'postcss-import',
  'postcss-simple-vars',
  !nesting && kPostcssNested, // see 'nesting-rules' comment
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
].filter(Boolean);
const cfg = {plugins};
const cfgNoNesting = nesting && {plugins: plugins.filter(p => p !== kPostcssNested)};

module.exports = !nesting ? cfg :
  ctx => ctx.file.endsWith('global-dark.css') // ::-webkit-scrollbar can't be nested
    ? cfgNoNesting
    : cfg;
