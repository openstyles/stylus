'use strict';

const globals = require('globals');

const SHIMS = 'tools/shim/*.js';
const SRC_GLOBALS = {
  ...globals.es2024,
  chrome: false,
  browser: false,
  global: false,
  process: false,
};

module.exports = [
  //#region Global exclusions
  {
    ignores: [
      'dist/',
      'src/vendor/',
      'src/vendor-overwrites/',
    ],
  },
  //#endregion
  //#region Global rules
  {
    rules: {
      'accessor-pairs': [2],
      'array-bracket-spacing': [2, 'never'],
      'array-callback-return': [0],
      'arrow-body-style': [2, 'as-needed'],
      'arrow-parens': [2, 'as-needed'],
      'arrow-spacing': [2, {before: true, after: true}],
      'block-scoped-var': [2],
      'brace-style': [2, '1tbs', {allowSingleLine: true}],
      'camelcase': [2, {properties: 'never'}],
      'class-methods-use-this': [2],
      'comma-dangle': [2, {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        exports: 'always-multiline',
        imports: 'always-multiline',
        functions: 'only-multiline',
      }],
      'comma-spacing': [2, {before: false, after: true}],
      'comma-style': [2, 'last'],
      'complexity': [0],
      'computed-property-spacing': [2, 'never'],
      'consistent-return': [0],
      'constructor-super': [2],
      'curly': [2, 'multi-line'],
      'default-case': [0],
      'dot-location': [2, 'property'],
      'dot-notation': [0],
      'eol-last': [2],
      'eqeqeq': [1, 'smart'],
      'func-call-spacing': [2, 'never'],
      'func-name-matching': [0],
      'func-names': [0],
      'generator-star-spacing': [2, 'before'],
      'global-require': [0],
      'guard-for-in': [0],
      'handle-callback-err': [2, '^(err|error)$'],
      'id-blacklist': [0],
      'id-length': [0],
      'id-match': [0],
      'indent': [2, 2, {
        SwitchCase: 1,
        ignoreComments: true,
        ignoredNodes: [
          'TemplateLiteral > *',
          'ConditionalExpression',
          'ForStatement',
        ],
      }],
      'jsx-quotes': [0],
      'key-spacing': [0],
      'keyword-spacing': [2],
      'lines-around-comment': [0],
      'lines-around-directive': [0],
      'max-len': [2, {
        code: 100,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
      }],
      'max-lines': [0],
      'max-nested-callbacks': [0],
      'max-params': [0],
      'max-statements-per-line': [0],
      'max-statements': [0],
      'multiline-ternary': [0],
      'new-cap': [0],
      'new-parens': [2],
      'newline-before-return': [0],
      'newline-per-chained-call': [0],
      'no-alert': [0],
      'no-array-constructor': [0],
      'no-bitwise': [0],
      'no-caller': [2],
      'no-case-declarations': [2],
      'no-class-assign': [2],
      'no-cond-assign': [2, 'except-parens'],
      'no-confusing-arrow': [0, {allowParens: true}],
      'no-const-assign': [2],
      'no-constant-condition': [0],
      'no-continue': [0],
      'no-control-regex': [0],
      'no-debugger': [2],
      'no-delete-var': [2],
      'no-div-regex': [0],
      'no-dupe-args': [2],
      'no-dupe-class-members': [2],
      'no-dupe-keys': [2],
      'no-duplicate-case': [2],
      'no-duplicate-imports': [2],
      'no-else-return': [0],
      'no-empty-character-class': [2],
      'no-empty-function': [0],
      'no-empty-pattern': [2],
      'no-empty': [2, {allowEmptyCatch: true}],
      'no-eq-null': [0],
      'no-eval': [2],
      'no-ex-assign': [0],
      'no-extend-native': [2],
      'no-extra-bind': [2],
      'no-extra-boolean-cast': [2],
      'no-extra-label': [0],
      'no-extra-parens': [0],
      'no-extra-semi': [2],
      'no-fallthrough': [2, {commentPattern: 'fallthrough.*'}],
      'no-floating-decimal': [0],
      'no-func-assign': [2],
      'no-global-assign': [2],
      'no-implicit-coercion': [2, {allow: ['!!', '+']}],
      'no-implicit-globals': [0],
      'no-implied-eval': [2],
      'no-inline-comments': [0],
      'no-inner-declarations': [2],
      'no-invalid-regexp': [2],
      'no-invalid-this': [0],
      'no-irregular-whitespace': [2],
      'no-iterator': [2],
      'no-label-var': [2],
      'no-labels': [2, {allowLoop: true}],
      'no-lone-blocks': [2],
      'no-lonely-if': [0],
      'no-loop-func': [0],
      'no-magic-numbers': [0],
      'no-mixed-operators': [0],
      'no-mixed-requires': [2, true],
      'no-mixed-spaces-and-tabs': [2],
      'no-multi-spaces': [2, {ignoreEOLComments: true}],
      'no-multi-str': [2],
      'no-multiple-empty-lines': [2, {
        max: 2,
        maxEOF: 0,
        maxBOF: 0,
      }],
      'no-native-reassign': [2],
      'no-negated-condition': [0],
      'no-negated-in-lhs': [2],
      'no-nested-ternary': [0],
      'no-new-func': [2],
      'no-new-object': [2],
      'no-new-require': [2],
      'no-new-symbol': [2],
      'no-new-wrappers': [2],
      'no-new': [0],
      'no-obj-calls': [2],
      'no-octal-escape': [2],
      'no-octal': [2],
      'no-path-concat': [0],
      'no-process-exit': [0],
      'no-proto': [2],
      'no-redeclare': [2],
      'no-regex-spaces': [2],
      'no-restricted-globals': [2, 'name', 'event'],
      'no-restricted-imports': [0],
      'no-restricted-modules': [2, 'domain', 'freelist', 'smalloc', 'sys'],
      'no-restricted-syntax': [2, 'WithStatement', {
        selector: 'MemberExpression > Identifier.property[name="isIntersecting"]',
        message: 'Requires Chrome 58+. Please use intersectionRatio instead.',
      }],
      'no-return-assign': [2, 'except-parens'],
      'no-return-await': [2],
      'no-script-url': [2],
      'no-self-assign': [2, {props: true}],
      'no-self-compare': [2],
      'no-sequences': [2],
      'no-shadow-restricted-names': [2],
      'no-shadow': [2, {hoist: 'all'}],
      'no-spaced-func': [2],
      'no-sparse-arrays': [2],
      'no-tabs': [2],
      'no-template-curly-in-string': [2],
      'no-this-before-super': [2],
      'no-throw-literal': [0],
      'no-trailing-spaces': [2],
      'no-undef-init': [2],
      'no-undef': [2],
      'no-underscore-dangle': [0],
      'no-unexpected-multiline': [2],
      'no-unmodified-loop-condition': [0],
      'no-unneeded-ternary': [2],
      'no-unreachable': [2],
      'no-unsafe-finally': [2],
      'no-unsafe-negation': [2],
      'no-unused-expressions': [2],
      'no-unused-labels': [0],
      'no-unused-vars': [2, {
        args: 'after-used',
        argsIgnorePattern: '^_',
      }],
      'no-use-before-define': [2, 'nofunc'],
      'no-useless-call': [2],
      'no-useless-computed-key': [2],
      'no-useless-concat': [2],
      'no-useless-constructor': [2],
      'no-useless-escape': [2],
      'no-var': [1],
      'no-warning-comments': [0],
      'no-whitespace-before-property': [2],
      'no-with': [2],
      'object-curly-newline': [0],
      'object-curly-spacing': [2, 'never'],
      'object-shorthand': [0],
      'one-var-declaration-per-line': [1],
      'one-var': [2, {initialized: 'never'}],
      'operator-assignment': [2, 'always'],
      'operator-linebreak': [2, 'after', {
        overrides: {
          '?': 'ignore',
          ':': 'ignore',
          '&&': 'ignore',
          '||': 'ignore',
        },
      }],
      'padded-blocks': [0],
      'prefer-numeric-literals': [2],
      'prefer-rest-params': [0],
      'prefer-const': [1, {
        destructuring: 'all',
        ignoreReadBeforeAssign: true,
      }],
      'quote-props': [0],
      'quotes': [1, 'single', {
        avoidEscape: true,
        allowTemplateLiterals: true,
      }],
      'radix': [0, 'always'],
      'require-jsdoc': [0],
      'require-yield': [2],
      'semi-spacing': [2, {before: false, after: true}],
      'semi': [2, 'always'],
      'sort-imports': [0],
      'sort-keys': [0],
      'space-before-blocks': [2, 'always'],
      'space-before-function-paren': [2, {
        anonymous: 'always',
        asyncArrow: 'always',
        named: 'never',
      }],
      'space-in-parens': [2, 'never'],
      'space-infix-ops': [2],
      'space-unary-ops': [2],
      'spaced-comment': [0, 'always', {markers: ['!']}],
      'strict': [2, 'global'],
      'symbol-description': [2],
      'template-curly-spacing': [2, 'never'],
      'unicode-bom': [2, 'never'],
      'use-isnan': [2],
      'valid-typeof': [2],
      'wrap-iife': [2, 'inside'],
      'yield-star-spacing': [2, {before: true, after: false}],
      'yoda': [2, 'never'],
    },
  },
  //#endregion
  //#region Tooling
  {
    files: ['tools/**/*.js', '*.js'],
    ignores: [SHIMS],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023, // nodejs 20 per https://compat-table.github.io/compat-table/es2016plus/
      sourceType: 'commonjs',
    },
  },
  //#endregion
  //#region Content scripts
  {
    files: ['src/content/*'],
    rules: {
      'no-restricted-imports': [2, {
        paths: [{
          name: '/js/msg',
          message: "Use 'msg-base' in content scripts.",
        }],
      }],
    },
  },
  //#endregion
  //#region SRC
  {
    files: ['src/**/*.js', SHIMS],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...SRC_GLOBALS,
      },
      sourceType: 'module',
    },
  },
  //#endregion
  //#region Background service worker
  {
    files: ['src/background-sw/**/*'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...SRC_GLOBALS,
      },
    },
  },
  //#region Workers
  {
    files: ['src/**/*worker*.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        ...SRC_GLOBALS,
      },
    },
  },
  //#endregion
];
