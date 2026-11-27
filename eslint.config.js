'use strict';

const globals = require('globals');
const eslintJS = require('@eslint/js');
const pluginSecureCoding = require('eslint-plugin-secure-coding');
const pluginStylistic = require('@stylistic/eslint-plugin');

const WORKERS = ['src/js/worker/**'];
const SHIMS = 'tools/shim/*.js';
const SRC_GLOBALS = {
  ...globals.es2024,
  chrome: false,
  browser: false,
  global: false,
  __: false,
};

let v;

module.exports = [
  //#region Global exclusions
  {
    ignores: [
      'dist*/',
      'src/vendor/',
      'src/vendor-overwrites/',
    ],
  },
  //#endregion
  eslintJS.configs.recommended,
  pluginSecureCoding.configs.recommended,
  pluginStylistic.configs.recommended,
  //#region Global rules
  {
    plugins: {
      '@stylistic': pluginStylistic,
    },
    rules: Object.assign({
      'accessor-pairs': [2],
      'block-scoped-var': [2],
      'camelcase': [2, {properties: 'never', ignoreGlobals: true, allow: ['^k_']}],
      'class-methods-use-this': [2],
      'curly': [0, 'multi-or-nest', 'consistent'],
      'eqeqeq': [1, 'smart'],
      'no-caller': [2],
      'no-control-regex': [0],
      'no-duplicate-imports': [2],
      'no-empty': [2, {allowEmptyCatch: true}],
      'no-eval': [2],
      'no-ex-assign': [0],
      'no-extend-native': [2],
      'no-extra-bind': [2],
      'no-extra-boolean-cast': [2],
      'no-fallthrough': [2, {commentPattern: 'fallthrough.*'}],
      'no-global-assign': [2],
      'no-implicit-coercion': [2, {allow: ['!!', '+']}],
      'no-implied-eval': [2],
      'no-inner-declarations': [2],
      'no-iterator': [2],
      'no-label-var': [2],
      'no-labels': [2, {allowLoop: true}],
      'no-lone-blocks': [2],
      'no-multi-str': [2],
      'no-new-func': [2],
      'no-new-wrappers': [2],
      'no-object-constructor': [2],
      'no-octal-escape': [2],
      'no-proto': [2],
      'no-restricted-globals': [2, 'name', 'event'],
      'no-return-await': [2],
      'no-script-url': [2],
      'no-self-compare': [2],
      'no-shadow': [2, {hoist: 'all'}],
      'no-shadow-restricted-names': [2],
      'no-template-curly-in-string': [2],
      'no-undef-init': [2],
      'no-unneeded-ternary': [2],
      'no-unreachable': [2],
      'no-unsafe-negation': [2],
      'no-unused-expressions': [2],
      'no-use-before-define': [2, {functions: false, variables: false}],
      'no-useless-call': [2],
      'no-useless-computed-key': [2],
      'no-useless-concat': [2],
      'no-useless-constructor': [2],
      'no-var': [1],
      'one-var': [2, {initialized: 'never'}],
      'prefer-const': [1, {
        destructuring: 'all',
        ignoreReadBeforeAssign: true,
      }],
      'prefer-numeric-literals': [2],
      'strict': [2, 'global'],
      'symbol-description': [2],
    }, {
      'secure-coding/no-unsafe-regex-construction': [0],
    }, {
      '@stylistic/array-bracket-spacing': [2, 'never'],
      '@stylistic/arrow-parens': [2, 'as-needed'],
      '@stylistic/brace-style': [2, '1tbs', {allowSingleLine: true}],
      '@stylistic/block-spacing': [0],
      '@stylistic/comma-dangle': [2, {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        exports: 'always-multiline',
        imports: 'always-multiline',
        functions: 'only-multiline',
      }],
      '@stylistic/eol-last': [2],
      '@stylistic/function-call-spacing': [2],
      '@stylistic/generator-star-spacing': [2, 'before'],
      '@stylistic/indent': [2, 2, {
        SwitchCase: 1,
        ignoreComments: true,
        ignoredNodes: [
          'AssignmentExpression',
          'ConditionalExpression',
          'ForStatement',
          'TemplateLiteral > *',
        ],
      }],
      '@stylistic/indent-binary-ops': [0],
      '@stylistic/key-spacing': [0],
      '@stylistic/keyword-spacing': [2],
      '@stylistic/lines-around-comment': [0],
      '@stylistic/lines-between-class-members': [0],
      '@stylistic/list-style': [0],
      '@stylistic/max-len': [2, {
        code: 100,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
      }],
      '@stylistic/max-statements-per-line': [0],
      '@stylistic/multiline-ternary': [0],
      '@stylistic/new-parens': [2],
      '@stylistic/newline-per-chained-call': [0],
      '@stylistic/no-confusing-arrow': [0, {allowParens: true}],
      '@stylistic/no-extra-parens': [0],
      '@stylistic/no-extra-semi': [2],
      '@stylistic/no-floating-decimal': [0],
      '@stylistic/no-mixed-operators': [0],
      '@stylistic/no-mixed-spaces-and-tabs': [2],
      '@stylistic/no-multi-spaces': [2, {
        ignoreEOLComments: true,
        exceptions: {Property: true},
      }],
      '@stylistic/no-multiple-empty-lines': [2, {
        max: 2,
        maxEOF: 0,
        maxBOF: 0,
      }],
      '@stylistic/no-tabs': [2],
      '@stylistic/no-trailing-spaces': [2],
      '@stylistic/no-whitespace-before-property': [2],
      '@stylistic/object-curly-spacing': [2, 'never'],
      '@stylistic/one-var-declaration-per-line': [1],
      '@stylistic/operator-linebreak': [2, 'after', {
        overrides: {
          '?': 'ignore',
          ':': 'ignore',
          '&&': 'ignore',
          '||': 'ignore',
        },
      }],
      '@stylistic/padded-blocks': [0],
      '@stylistic/quote-props': [0],
      '@stylistic/quotes': [1, 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'always',
      }],
      '@stylistic/semi': [2, 'always'],
      '@stylistic/space-before-function-paren': [2, {
        anonymous: 'always',
        asyncArrow: 'always',
        named: 'never',
      }],
      '@stylistic/space-infix-ops': [2],
      '@stylistic/space-unary-ops': [2],
      '@stylistic/spaced-comment': [0, 'always', {markers: ['!']}],
      '@stylistic/wrap-iife': [2, 'inside'],
      '@stylistic/yield-star-spacing': [2, {before: true, after: false}],
    }),
  },
  //#endregion
  //#region Tooling
  v = {
    files: ['tools/**/*.mjs', '*.mjs'],
    ignores: [SHIMS],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023, // nodejs 20 per https://compat-table.github.io/compat-table/es2016plus/
    },
  },
  {
    ...v,
    files: ['tools/**/*.js', '*.js'],
    languageOptions: {...v.languageOptions, sourceType: 'commonjs'},
  },
  //#endregion
  //#region SHIMS
  {
    files: [SHIMS],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
  //#endregion
  //#region SRC
  {
    files: ['src/**/*.js'],
    ignores: WORKERS,
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...SRC_GLOBALS,
        $: false,
        $$: false,
        $id: false,
        $tag: false,
      },
      sourceType: 'module',
    },
  },
  //#endregion
  //#region SRC copied
  {
    files: ['src/content/install*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...SRC_GLOBALS,
      },
    },
  },
  //#endregion
  //#region SRC used in content scripts
  {
    files: [
      'src/content/*',
      'src/js/msg.js',
      'src/js/msg-api.js',
    ],
    rules: {
      // TODO: use sideEffects:false in webpack?
      'no-restricted-imports': [2, '@/js/util-webext'],
    },
  },
  //#endregion
  //#region Background service worker
  {
    files: ['src/background/sw/**/*'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...SRC_GLOBALS,
      },
    },
  },
  //#region Workers
  {
    files: WORKERS,
    languageOptions: {
      globals: {
        ...globals.worker,
        ...SRC_GLOBALS,
      },
    },
  },
  //#endregion
];
