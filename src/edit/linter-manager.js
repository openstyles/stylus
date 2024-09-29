import {$, $create} from '/js/dom';
import * as prefs from '/js/prefs';
import {chromeSync} from '/js/storage-util';
import {clipString} from '/js/toolbox';
import createWorker from '/js/worker-host';
import editor from './editor';

//#region linterMan

// TODO: export directly
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
    cm.state.lint.options.getAnnotations = getAnnotations;
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
      'no-invalid-double-slash-comments': [true, {severity: 'warning'}],
      'property-no-unknown': [true, {severity: 'warning'}],
      'selector-pseudo-class-no-unknown': [true, {severity: 'warning'}],
      'selector-pseudo-element-no-unknown': [true, {severity: 'warning'}],
      'string-no-newline': [true, {severity: 'warning'}],
      'unit-no-unknown': [true, {severity: 'warning'}],
    },
  },
  csslint: {
    'display-property-grouping': 1,
    'duplicate-properties': 1,
    'empty-rules': 1,
    'errors': 1,
    'globals-in-document': 1,
    'known-properties': 1,
    'known-pseudos': 1,
    'selector-newline': 1,
    'shorthand-overrides': 1,
    'simple-not': 1,
    'warnings': 1,
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
        config.doc = !editor.isUsercss;
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
      lint: (code, config, mode) => worker.stylelint({code, config, mode}),
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
    $('#lint').hidden = !issueCount;
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
    const caption = $create('.caption');
    const table = $create('table');
    const report = $create('.report', [caption, table]);
    const trs = [];
    return {
      element: report,
      trs,
      updateAnnotations,
      updateCaption,
    };

    function updateCaption() {
      const t = editor.getEditorTitle(cm);
      Object.assign(caption, typeof t == 'string' ? {textContent: t} : t);
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
          table.appendChild(tr.element);
        }
        tr.update(anno);
        i++;
      }
      if (i === 0) {
        trs.length = 0;
        table.textContent = '';
      } else {
        while (trs.length > i) {
          trs.pop().element.remove();
        }
      }
      report.classList.toggle('empty', !trs.length);

      function *getAnnotations() {
        for (const line of lines.filter(Boolean)) {
          yield *line;
        }
      }
    }

    function createTr() {
      let anno;
      const severityIcon = $create('div');
      const severity = $create('td', {'attr:role': 'severity'}, severityIcon);
      const line = $create('td', {'attr:role': 'line'});
      const col = $create('td', {'attr:role': 'col'});
      const message = $create('td', {'attr:role': 'message'});

      const trElement = $create('tr', {
        onclick: () => gotoLintIssue(cm, anno),
      }, [
        severity,
        line,
        $create('td', {'attr:role': 'sep'}, ':'),
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

export default linterMan;
