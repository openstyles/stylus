/* global linter editorWorker cacheFn */
'use strict';

var stylelint = (() => { // eslint-disable-line no-var
  const DEFAULT_SEVERITY = {severity: 'warning'};
  const DEFAULT = {
    // 'sugarss' is a indent-based syntax like Sass or Stylus
    // ref: https://github.com/postcss/postcss#syntaxes
    // syntax: 'sugarss',
    // ** recommended rules **
    // ref: https://github.com/stylelint/stylelint-config-recommended/blob/master/index.js
    rules: {
      'at-rule-no-unknown': [true, DEFAULT_SEVERITY],
      'block-no-empty': [true, DEFAULT_SEVERITY],
      'color-no-invalid-hex': [true, DEFAULT_SEVERITY],
      'declaration-block-no-duplicate-properties': [true, {
        'ignore': ['consecutive-duplicates-with-different-values'],
        'severity': 'warning'
      }],
      'declaration-block-no-shorthand-property-overrides': [true, DEFAULT_SEVERITY],
      'font-family-no-duplicate-names': [true, DEFAULT_SEVERITY],
      'function-calc-no-unspaced-operator': [true, DEFAULT_SEVERITY],
      'function-linear-gradient-no-nonstandard-direction': [true, DEFAULT_SEVERITY],
      'keyframe-declaration-no-important': [true, DEFAULT_SEVERITY],
      'media-feature-name-no-unknown': [true, DEFAULT_SEVERITY],
      /* recommended true */
      'no-empty-source': false,
      'no-extra-semicolons': [true, DEFAULT_SEVERITY],
      'no-invalid-double-slash-comments': [true, DEFAULT_SEVERITY],
      'property-no-unknown': [true, DEFAULT_SEVERITY],
      'selector-pseudo-class-no-unknown': [true, DEFAULT_SEVERITY],
      'selector-pseudo-element-no-unknown': [true, DEFAULT_SEVERITY],
      'selector-type-no-unknown': false, // for scss/less/stylus-lang
      'string-no-newline': [true, DEFAULT_SEVERITY],
      'unit-no-unknown': [true, DEFAULT_SEVERITY],

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
  let config;

  const prepareConfig = cacheFn(() => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.hasOwnProperty('editorStylelintConfig')) {
        return;
      }
      getNewValue().then(linter.refresh);
    });
    return getNewValue();

    function getNewValue() {
      return chromeSync.getLZValue('editorStylelintConfig')
        .then(newConfig => {
          const output = {};
          output.rules = Object.assign({}, DEFAULT.rules, newConfig && newConfig.rules);
          output.syntax = 'sugarss';
          config = output;
        });
    }
  });

  linter.register((text, options, cm) => {
    if (
      !prefs.get('editor.linter') ||
      cm.getOption('mode') === 'css' && prefs.get('editor.linter') !== 'stylelint'
    ) {
      return;
    }
    return prepareConfig()
      .then(() => editorWorker.stylelint(text, config))
      .then(({results}) => {
        if (!results[0]) {
          return [];
        }
        const output = results[0].warnings.map(({line, column: ch, text, severity}) =>
          ({
            from: {line: line - 1, ch: ch - 1},
            to: {line: line - 1, ch},
            message: text
              .replace('Unexpected ', '')
              .replace(/^./, firstLetter => firstLetter.toUpperCase())
              .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
            rule: text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
            severity,
          })
        );
        return cm.doc.mode.name !== 'stylus' ?
          output :
          output.filter(({message}) =>
            !message.includes('"@css"') || !message.includes('(at-rule-no-unknown)'));
      });
  });

  return {DEFAULT};
})();
