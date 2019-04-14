/* exported LINTER_DEFAULTS */
'use strict';

const LINTER_DEFAULTS = (() => {
  const SEVERITY = {severity: 'warning'};
  const STYLELINT = {
    // 'sugarss' is a indent-based syntax like Sass or Stylus
    // ref: https://github.com/postcss/postcss#syntaxes
    // syntax: 'sugarss',
    // ** recommended rules **
    // ref: https://github.com/stylelint/stylelint-config-recommended/blob/master/index.js
    rules: {
      'at-rule-no-unknown': [true, {
        'ignoreAtRules': ['extend', 'extends', 'css', 'block'],
        'severity': 'warning'
      }],
      'block-no-empty': [true, SEVERITY],
      'color-no-invalid-hex': [true, SEVERITY],
      'declaration-block-no-duplicate-properties': [true, {
        'ignore': ['consecutive-duplicates-with-different-values'],
        'severity': 'warning'
      }],
      'declaration-block-no-shorthand-property-overrides': [true, SEVERITY],
      'font-family-no-duplicate-names': [true, SEVERITY],
      'function-calc-no-unspaced-operator': [true, SEVERITY],
      'function-linear-gradient-no-nonstandard-direction': [true, SEVERITY],
      'keyframe-declaration-no-important': [true, SEVERITY],
      'media-feature-name-no-unknown': [true, SEVERITY],
      /* recommended true */
      'no-empty-source': false,
      'no-extra-semicolons': [true, SEVERITY],
      'no-invalid-double-slash-comments': [true, SEVERITY],
      'property-no-unknown': [true, SEVERITY],
      'selector-pseudo-class-no-unknown': [true, SEVERITY],
      'selector-pseudo-element-no-unknown': [true, SEVERITY],
      'selector-type-no-unknown': false, // for scss/less/stylus-lang
      'string-no-newline': [true, SEVERITY],
      'unit-no-unknown': [true, SEVERITY],

      // ** non-essential rules
      'comment-no-empty': false,
      'declaration-block-no-redundant-longhand-properties': false,
      'shorthand-property-no-redundant-values': false,

      // ** stylistic rules **
      /*
      'at-rule-empty-line-before': [
        'always',
        {
          'except': [
            'blockless-after-same-name-blockless',
            'first-nested'
          ],
          'ignore': [
            'after-comment'
          ]
        }
      ],
      'at-rule-name-case': 'lower',
      'at-rule-name-space-after': 'always-single-line',
      'at-rule-semicolon-newline-after': 'always',
      'block-closing-brace-empty-line-before': 'never',
      'block-closing-brace-newline-after': 'always',
      'block-closing-brace-newline-before': 'always-multi-line',
      'block-closing-brace-space-before': 'always-single-line',
      'block-opening-brace-newline-after': 'always-multi-line',
      'block-opening-brace-space-after': 'always-single-line',
      'block-opening-brace-space-before': 'always',
      'color-hex-case': 'lower',
      'color-hex-length': 'short',
      'comment-empty-line-before': [
        'always',
        {
          'except': [
            'first-nested'
          ],
          'ignore': [
            'stylelint-commands'
          ]
        }
      ],
      'comment-whitespace-inside': 'always',
      'custom-property-empty-line-before': [
        'always',
        {
          'except': [
            'after-custom-property',
            'first-nested'
          ],
          'ignore': [
            'after-comment',
            'inside-single-line-block'
          ]
        }
      ],
      'declaration-bang-space-after': 'never',
      'declaration-bang-space-before': 'always',
      'declaration-block-semicolon-newline-after': 'always-multi-line',
      'declaration-block-semicolon-space-after': 'always-single-line',
      'declaration-block-semicolon-space-before': 'never',
      'declaration-block-single-line-max-declarations': 1,
      'declaration-block-trailing-semicolon': 'always',
      'declaration-colon-newline-after': 'always-multi-line',
      'declaration-colon-space-after': 'always-single-line',
      'declaration-colon-space-before': 'never',
      'declaration-empty-line-before': [
        'always',
        {
          'except': [
            'after-declaration',
            'first-nested'
          ],
          'ignore': [
            'after-comment',
            'inside-single-line-block'
          ]
        }
      ],
      'function-comma-newline-after': 'always-multi-line',
      'function-comma-space-after': 'always-single-line',
      'function-comma-space-before': 'never',
      'function-max-empty-lines': 0,
      'function-name-case': 'lower',
      'function-parentheses-newline-inside': 'always-multi-line',
      'function-parentheses-space-inside': 'never-single-line',
      'function-whitespace-after': 'always',
      'indentation': 2,
      'length-zero-no-unit': true,
      'max-empty-lines': 1,
      'media-feature-colon-space-after': 'always',
      'media-feature-colon-space-before': 'never',
      'media-feature-name-case': 'lower',
      'media-feature-parentheses-space-inside': 'never',
      'media-feature-range-operator-space-after': 'always',
      'media-feature-range-operator-space-before': 'always',
      'media-query-list-comma-newline-after': 'always-multi-line',
      'media-query-list-comma-space-after': 'always-single-line',
      'media-query-list-comma-space-before': 'never',
      'no-eol-whitespace': true,
      'no-missing-end-of-source-newline': true,
      'number-leading-zero': 'always',
      'number-no-trailing-zeros': true,
      'property-case': 'lower',
      'rule-empty-line-before': [
        'always-multi-line',
        {
          'except': [
            'first-nested'
          ],
          'ignore': [
            'after-comment'
          ]
        }
      ],
      'selector-attribute-brackets-space-inside': 'never',
      'selector-attribute-operator-space-after': 'never',
      'selector-attribute-operator-space-before': 'never',
      'selector-combinator-space-after': 'always',
      'selector-combinator-space-before': 'always',
      'selector-descendant-combinator-no-non-space': true,
      'selector-list-comma-newline-after': 'always',
      'selector-list-comma-space-before': 'never',
      'selector-max-empty-lines': 0,
      'selector-pseudo-class-case': 'lower',
      'selector-pseudo-class-parentheses-space-inside': 'never',
      'selector-pseudo-element-case': 'lower',
      'selector-pseudo-element-colon-notation': 'double',
      'selector-type-case': 'lower',
      'unit-case': 'lower',
      'value-list-comma-newline-after': 'always-multi-line',
      'value-list-comma-space-after': 'always-single-line',
      'value-list-comma-space-before': 'never',
      'value-list-max-empty-lines': 0
      */
    }
  };
  const CSSLINT = {
    // Default warnings
    'display-property-grouping': 1,
    'duplicate-properties': 1,
    'empty-rules': 1,
    'errors': 1,
    'warnings': 1,
    'known-properties': 1,

    // Default disabled
    'adjoining-classes': 0,
    'box-model': 0,
    'box-sizing': 0,
    'bulletproof-font-face': 0,
    'compatible-vendor-prefixes': 0,
    'duplicate-background-images': 0,
    'fallback-colors': 0,
    'floats': 0,
    'font-faces': 0,
    'font-sizes': 0,
    'gradients': 0,
    'ids': 0,
    'import': 0,
    'import-ie-limit': 0,
    'important': 0,
    'order-alphabetical': 0,
    'outline-none': 0,
    'overqualified-elements': 0,
    'qualified-headings': 0,
    'regex-selectors': 0,
    'rules-count': 0,
    'selector-max': 0,
    'selector-max-approaching': 0,
    'selector-newline': 0,
    'shorthand': 0,
    'star-property-hack': 0,
    'text-indent': 0,
    'underscore-property-hack': 0,
    'unique-headings': 0,
    'universal-selector': 0,
    'unqualified-attributes': 0,
    'vendor-prefix': 0,
    'zero-units': 0
  };
  return {STYLELINT, CSSLINT, SEVERITY};
})();
