/* global $ $create */// dom.js
/* global chromeSync */// storage-util.js
/* global clipString */// util.js
/* global createWorker */// worker-util.js
/* global editor */
/* global prefs */
'use strict';

//#region linterMan

const linterMan = (() => {
  const cms = new Map();
  const linters = [];
  const lintingUpdatedListeners = [];
  const unhookListeners = [];
  return {

    /** @type {EditorWorker} */
    worker: createWorker({url: '/edit/editor-worker'}),

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

  function onUpdateLinting(...args) {
    for (const fn of lintingUpdatedListeners) {
      fn(...args);
    }
  }
})();

//#endregion
//#region DEFAULTS

linterMan.DEFAULTS = {
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
    'globals-in-document': 1,
    'known-properties': 1,
    'selector-newline': 1,
    'shorthand-overrides': 1,
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

//#endregion
//#region ENGINES

(() => {
  const configs = new Map();
  const {DEFAULTS, worker} = linterMan;
  const ENGINES = {
    csslint: {
      validMode: mode => mode === 'css',
      getConfig: config => Object.assign({}, DEFAULTS.csslint, config),
      async lint(text, config) {
        const results = await worker.csslint(text, config);
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
        rules: Object.assign({}, DEFAULTS.stylelint.rules, config && config.rules),
      }),
      async lint(code, config, mode) {
        const isLess = mode === 'text/x-less';
        const isStylus = mode === 'stylus';
        const syntax = isLess ? 'less' : isStylus ? 'sugarss' : 'css';
        const raw = await worker.stylelint({code, config, syntax});
        if (!raw) {
          return [];
        }
        // Hiding the errors about "//" comments as we're preprocessing only when saving/applying
        // and we can't just pre-remove the comments since "//" may be inside a string token
        const slashCommentAllowed = isLess || isStylus;
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

  async function getConfig(name) {
    const rawCfg = await chromeSync.getLZValue(chromeSync.LZ_KEY[name]);
    const cfg = ENGINES[name].getConfig(rawCfg);
    configs.set(name, cfg);
    return cfg;
  }
})();

//#endregion
//#region Reports

(() => {
  const tables = new Map();

  linterMan.onLintingUpdated((annotationsNotSorted, annotations, cm) => {
    let table = tables.get(cm);
    if (!table) {
      table = createTable(cm);
      tables.set(cm, table);
      const container = $('.lint-report-container');
      const nextSibling = findNextSibling(tables, cm);
      container.insertBefore(table.element, nextSibling && tables.get(nextSibling).element);
    }
    table.updateCaption();
    table.updateAnnotations(annotations);
    updateCount();
  });

  linterMan.onUnhook(cm => {
    const table = tables.get(cm);
    if (table) {
      table.element.remove();
      tables.delete(cm);
    }
    updateCount();
  });

  Object.assign(linterMan, {

    getIssues() {
      const issues = new Set();
      for (const table of tables.values()) {
        for (const tr of table.trs) {
          issues.add(tr.getAnnotation());
        }
      }
      return issues;
    },

    refreshReport() {
      for (const table of tables.values()) {
        table.updateCaption();
      }
    },
  });

  function updateCount() {
    const issueCount = Array.from(tables.values())
      .reduce((sum, table) => sum + table.trs.length, 0);
    $('#lint').classList.toggle('hidden-unless-compact', issueCount === 0);
    $('#issue-count').textContent = issueCount;
  }

  function findNextSibling(tables, cm) {
    const editors = editor.getEditors();
    let i = editors.indexOf(cm) + 1;
    while (i < editors.length) {
      if (tables.has(editors[i])) {
        return editors[i];
      }
      i++;
    }
  }

  function createTable(cm) {
    const caption = $create('caption');
    const tbody = $create('tbody');
    const table = $create('table', [caption, tbody]);
    const trs = [];
    return {
      element: table,
      trs,
      updateAnnotations,
      updateCaption,
    };

    function updateCaption() {
      caption.textContent = editor.getEditorTitle(cm);
    }

    function updateAnnotations(lines) {
      let i = 0;
      for (const anno of getAnnotations()) {
        let tr;
        if (i < trs.length) {
          tr = trs[i];
        } else {
          tr = createTr();
          trs.push(tr);
          tbody.append(tr.element);
        }
        tr.update(anno);
        i++;
      }
      if (i === 0) {
        trs.length = 0;
        tbody.textContent = '';
      } else {
        while (trs.length > i) {
          trs.pop().element.remove();
        }
      }
      table.classList.toggle('empty', trs.length === 0);

      function *getAnnotations() {
        for (const line of lines.filter(Boolean)) {
          yield *line;
        }
      }
    }

    function createTr() {
      let anno;
      const severityIcon = $create('div');
      const severity = $create('td', {attributes: {role: 'severity'}}, severityIcon);
      const line = $create('td', {attributes: {role: 'line'}});
      const col = $create('td', {attributes: {role: 'col'}});
      const message = $create('td', {attributes: {role: 'message'}});

      const trElement = $create('tr', {
        onclick: () => gotoLintIssue(cm, anno),
      }, [
        severity,
        line,
        $create('td', {attributes: {role: 'sep'}}, ':'),
        col,
        message,
      ]);
      return {
        element: trElement,
        update,
        getAnnotation: () => anno,
      };

      function update(_anno) {
        anno = _anno;
        trElement.className = anno.severity;
        severity.dataset.rule = anno.rule;
        severityIcon.className = `CodeMirror-lint-marker CodeMirror-lint-marker-${anno.severity}`;
        severityIcon.textContent = anno.severity;
        line.textContent = anno.from.line + 1;
        col.textContent = anno.from.ch + 1;
        message.title = clipString(anno.message, 1000) +
          (anno.rule ? `\n(${anno.rule})` : '');
        message.textContent = clipString(anno.message, 100).replace(/ at line.*/, '');
      }
    }
  }

  function gotoLintIssue(cm, anno) {
    editor.scrollToEditor(cm);
    cm.focus();
    cm.jumpToPos(anno.from);
  }
})();

//#endregion
