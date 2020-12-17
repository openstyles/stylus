'use strict';

define(require => {
  const prefs = require('/js/prefs');
  const {chromeSync} = require('/js/storage-util');
  const {createWorker} = require('/js/worker-util');

  const cms = new Map();
  const configs = new Map();
  const linters = [];
  const lintingUpdatedListeners = [];
  const unhookListeners = [];

  const linterMan = {

    /** @type {EditorWorker} */
    worker: createWorker({
      url: '/edit/editor-worker.js',
    }),

    disableForEditor(cm) {
      cm.setOption('lint', false);
      cms.delete(cm);
      for (const cb of unhookListeners) {
        cb(cm);
      }
    },

    /**
     * @param {Object} cm
     * @param {string} [code] - to be used to avoid slowdowns when creating a lot of cms.
     * Enables lint option only if there are problems, thus avoiding a _very_ costly layout
     * update when lint gutter is added to a lot of editors simultaneously.
     */
    enableForEditor(cm, code) {
      if (cms.has(cm)) return;
      cms.set(cm, null);
      if (code) {
        enableOnProblems(cm, code);
      } else {
        cm.setOption('lint', {getAnnotations, onUpdateLinting});
      }
    },

    onLintingUpdated(fn) {
      lintingUpdatedListeners.push(fn);
    },

    onUnhook(fn) {
      unhookListeners.push(fn);
    },

    register(fn) {
      linters.push(fn);
    },

    run() {
      for (const cm of cms.keys()) {
        cm.performLint();
      }
    },
  };

  const DEFAULTS = linterMan.DEFAULTS = {
    stylelint: {
      rules: {
        'at-rule-no-unknown': [true, {
          'ignoreAtRules': ['extend', 'extends', 'css', 'block'],
          'severity': 'warning',
        }],
        'block-no-empty': [true, {severity: 'warning'}],
        'color-no-invalid-hex': [true, {severity: 'warning'}],
        'declaration-block-no-duplicate-properties': [true, {
          'ignore': ['consecutive-duplicates-with-different-values'],
          'severity': 'warning',
        }],
        'declaration-block-no-shorthand-property-overrides': [true, {severity: 'warning'}],
        'font-family-no-duplicate-names': [true, {severity: 'warning'}],
        'function-calc-no-unspaced-operator': [true, {severity: 'warning'}],
        'function-linear-gradient-no-nonstandard-direction': [true, {severity: 'warning'}],
        'keyframe-declaration-no-important': [true, {severity: 'warning'}],
        'media-feature-name-no-unknown': [true, {severity: 'warning'}],
        'no-empty-source': false,
        'no-extra-semicolons': [true, {severity: 'warning'}],
        'no-invalid-double-slash-comments': [true, {severity: 'warning'}],
        'property-no-unknown': [true, {severity: 'warning'}],
        'selector-pseudo-class-no-unknown': [true, {severity: 'warning'}],
        'selector-pseudo-element-no-unknown': [true, {severity: 'warning'}],
        'selector-type-no-unknown': false, // for scss/less/stylus-lang
        'string-no-newline': [true, {severity: 'warning'}],
        'unit-no-unknown': [true, {severity: 'warning'}],
        'comment-no-empty': false,
        'declaration-block-no-redundant-longhand-properties': false,
        'shorthand-property-no-redundant-values': false,
      },
    },
    csslint: {
      'display-property-grouping': 1,
      'duplicate-properties': 1,
      'empty-rules': 1,
      'errors': 1,
      'known-properties': 1,
      'simple-not': 1,
      'warnings': 1,
      // disabled
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
      'zero-units': 0,
    },
  };

  const ENGINES = {
    csslint: {
      validMode: mode => mode === 'css',
      getConfig: config => Object.assign({}, DEFAULTS.csslint, config),
      async lint(text, config) {
        const results = await linterMan.worker.csslint(text, config);
        return results
          .map(({line, col: ch, message, rule, type: severity}) => line && {
            message,
            from: {line: line - 1, ch: ch - 1},
            to: {line: line - 1, ch},
            rule: rule.id,
            severity,
          })
          .filter(Boolean);
      },
    },
    stylelint: {
      validMode: () => true,
      getConfig: config => ({
        syntax: 'sugarss',
        rules: Object.assign({}, DEFAULTS.stylelint.rules, config && config.rules),
      }),
      async lint(text, config, mode) {
        const raw = await linterMan.worker.stylelint(text, config);
        if (!raw) {
          return [];
        }
        // Hiding the errors about "//" comments as we're preprocessing only when saving/applying
        // and we can't just pre-remove the comments since "//" may be inside a string token
        const slashCommentAllowed = mode === 'text/x-less' || mode === 'stylus';
        const res = [];
        for (const w of raw.warnings) {
          const msg = w.text.match(/^(?:Unexpected\s+)?(.*?)\s*\([^()]+\)$|$/)[1] || w.text;
          if (!slashCommentAllowed || !(
            w.rule === 'no-invalid-double-slash-comments' ||
            w.rule === 'property-no-unknown' && msg.includes('"//"')
          )) {
            res.push({
              from: {line: w.line - 1, ch: w.column - 1},
              to: {line: w.line - 1, ch: w.column},
              message: msg.slice(0, 1).toUpperCase() + msg.slice(1),
              severity: w.severity,
              rule: w.rule,
            });
          }
        }
        return res;
      },
    },
  };

  async function enableOnProblems(cm, code) {
    const results = await getAnnotations(code, {}, cm);
    if (results.length || cm.display.renderedView) {
      cms.set(cm, results);
      cm.setOption('lint', {getAnnotations: getCachedAnnotations, onUpdateLinting});
    } else {
      cms.delete(cm);
    }
  }

  async function getAnnotations(...args) {
    const results = await Promise.all(linters.map(fn => fn(...args)));
    return [].concat(...results.filter(Boolean));
  }

  function getCachedAnnotations(code, opt, cm) {
    const results = cms.get(cm);
    cms.set(cm, null);
    cm.options.lint.getAnnotations = getAnnotations;
    return results;
  }

  async function getConfig(name) {
    const rawCfg = await chromeSync.getLZValue(chromeSync.LZ_KEY[name]);
    const cfg = ENGINES[name].getConfig(rawCfg);
    configs.set(name, cfg);
    return cfg;
  }

  function onUpdateLinting(...args) {
    for (const fn of lintingUpdatedListeners) {
      fn(...args);
    }
  }

  linterMan.register(async (text, _options, cm) => {
    const linter = prefs.get('editor.linter');
    if (linter) {
      const {mode} = cm.options;
      const currentFirst = Object.entries(ENGINES).sort(([a]) => a === linter ? -1 : 1);
      for (const [name, engine] of currentFirst) {
        if (engine.validMode(mode)) {
          const cfg = configs.get(name) || await getConfig(name);
          return ENGINES[name].lint(text, cfg, mode);
        }
      }
    }
  });

  chrome.storage.onChanged.addListener(changes => {
    for (const name of Object.keys(ENGINES)) {
      if (chromeSync.LZ_KEY[name] in changes) {
        getConfig(name).then(linterMan.run);
      }
    }
  });

  return linterMan;
});
