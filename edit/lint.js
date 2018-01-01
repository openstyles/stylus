/* global CodeMirror messageBox */
/* global editors makeSectionVisible showCodeMirrorPopup showHelp */
/* global loadScript require CSSLint stylelint */
'use strict';

onDOMready().then(loadLinterAssets);

// eslint-disable-next-line no-var
var linterConfig = {
  csslint: {},
  stylelint: {},
  defaults: {
    // set in lint-defaults-csslint.js
    csslint: {},
    // set in lint-defaults-stylelint.js
    stylelint: {},
  },
  storageName: {
    csslint: 'editorCSSLintConfig',
    stylelint: 'editorStylelintConfig',
  },
  worker: {
    csslint: {path: '/vendor-overwrites/csslint/csslint-worker.js'},
    stylelint: {path: '/vendor-overwrites/stylelint/stylelint-bundle.min.js'},
  },
  allRuleIds: {
    csslint: null,
    stylelint: null,
  },

  getName() {
    // some dirty hacks to override editor.linter getting from prefs
    const linter = prefs.get('editor.linter');
    const mode = linter && editors[0] && editors[0].doc.mode;
    return mode && mode !== 'css' && mode.name !== 'css' ? 'stylelint' : linter;
  },

  getCurrent(linter = linterConfig.getName()) {
    return this.fallbackToDefaults(this[linter] || {});
  },

  getForCodeMirror(linter = linterConfig.getName()) {
    return CodeMirror.lint && CodeMirror.lint[linter] ? {
      getAnnotations: CodeMirror.lint[linter],
      delay: prefs.get('editor.lintDelay'),
      preUpdateLinting(cm) {
        cm.startOperation();
      },
      onUpdateLinting(annotationsNotSorted, annotations, cm) {
        cm.endOperation();
        updateLintReport(cm, 0);
      },
    } : false;
  },

  fallbackToDefaults(config, linter = linterConfig.getName()) {
    if (config && Object.keys(config).length) {
      if (linter === 'stylelint') {
        // always use default syntax because we don't expose it in config UI
        config.syntax = this.defaults.stylelint.syntax;
      }
      return config;
    } else {
      return deepCopy(this.defaults[linter] || {});
    }
  },

  setLinter(linter = linterConfig.getName()) {
    linter = linter.toLowerCase();
    linter = linter === 'csslint' || linter === 'stylelint' ? linter : '';
    if (linterConfig.getName() !== linter) {
      prefs.set('editor.linter', linter);
    }
    return linter;
  },

  invokeWorker(message) {
    const worker = linterConfig.worker[message.linter || linterConfig.getName()];
    if (!worker.queue) {
      worker.queue = [];
      worker.instance.onmessage = ({data}) => {
        worker.queue.shift().resolve(data);
        if (worker.queue.length) {
          worker.instance.postMessage(worker.queue[0].message);
        }
      };
    }
    return new Promise(resolve => {
      worker.queue.push({message, resolve});
      if (worker.queue.length === 1) {
        worker.instance.postMessage(message);
      }
    });
  },

  getAllRuleIds(linter = linterConfig.getName()) {
    return Promise.resolve(
      this.allRuleIds[linter] ||
      this.invokeWorker({linter, action: 'getAllRuleIds'})
        .then(ids => (this.allRuleIds[linter] = ids.sort()))
    );
  },

  findInvalidRules(config, linter = linterConfig.getName()) {
    return this.getAllRuleIds(linter).then(allRuleIds => {
      const allRuleIdsSet = new Set(allRuleIds);
      const rules = linter === 'stylelint' ? config.rules : config;
      return Object.keys(rules).filter(rule => !allRuleIdsSet.has(rule));
    });
  },

  stringify(config = this.getCurrent()) {
    if (linterConfig.getName() === 'stylelint') {
      config.syntax = undefined;
    }
    return JSON.stringify(config, null, 2)
      .replace(/,\n\s+\{\n\s+("severity":\s"\w+")\n\s+\}/g, ', {$1}');
  },

  save(config) {
    config = this.fallbackToDefaults(config);
    const linter = linterConfig.getName();
    this[linter] = config;
    chromeSync.setLZValue(this.storageName[linter], config);
    return config;
  },

  loadAll() {
    return chromeSync.getLZValues([
      'editorCSSLintConfig',
      'editorStylelintConfig',
    ]).then(data => {
      this.csslint = this.fallbackToDefaults(data.editorCSSLintConfig, 'csslint');
      this.stylelint = this.fallbackToDefaults(data.editorStylelintConfig, 'stylelint');
    });
  },

  watchStorage() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        for (const name of ['editorCSSLintConfig', 'editorStylelintConfig']) {
          if (name in changes && changes[name].newValue !== changes[name].oldValue) {
            this.loadAll().then(updateLinter);
            break;
          }
        }
      }
    });
  },

  // this is an event listener so it can't refer to self via 'this'
  openOnClick(event) {
    event.preventDefault();
    setupLinterPopup(linterConfig.stringify());
  },

  showSavedMessage() {
    $('#help-popup .saved-message').classList.add('show');
    clearTimeout($('#help-popup .contents').timer);
    $('#help-popup .contents').timer = setTimeout(() => {
      // popup may be closed at this point
      const msg = $('#help-popup .saved-message');
      if (msg) {
        msg.classList.remove('show');
      }
    }, 2000);
  },

  init() {
    if (!this.init.pending) this.init.pending = this.loadAll();
    return this.init.pending;
  }
};

function initLint() {
  $('#lint-help').addEventListener('click', showLintHelp);
  $('#lint').addEventListener('click', gotoLintIssue);
  $('#linter-settings').addEventListener('click', linterConfig.openOnClick);

  updateLinter();
  linterConfig.watchStorage();
  prefs.subscribe(['editor.linter'], updateLinter);
}

function updateLinter({immediately, linter = linterConfig.getName()} = {}) {
  if (!immediately) {
    debounce(updateLinter, 0, {immediately: true, linter});
    return;
  }
  const GUTTERS_CLASS = 'CodeMirror-lint-markers';

  Promise.all([
    linterConfig.init(),
    loadLinterAssets(linter)
  ]).then(updateEditors);
  $('#linter-settings').style.display = !linter ? 'none' : 'inline-block';
  $('#lint').classList.add('hidden');

  function updateEditors() {
    CodeMirror.defaults.lint = linterConfig.getForCodeMirror(linter);
    const guttersOption = prepareGuttersOption();
    editors.forEach(cm => {
      if (cm.options.lint !== CodeMirror.defaults.lint) {
        cm.setOption('lint', CodeMirror.defaults.lint);
      }
      if (guttersOption) {
        cm.setOption('guttersOption', guttersOption);
        updateGutters(cm, guttersOption);
        cm.refresh();
      }
      setTimeout(updateLintReport, 0, cm);
    });
  }

  function prepareGuttersOption() {
    const gutters = CodeMirror.defaults.gutters;
    const needRefresh = Boolean(linter) !== gutters.includes(GUTTERS_CLASS);
    if (needRefresh) {
      if (linter) {
        gutters.push(GUTTERS_CLASS);
      } else {
        gutters.splice(gutters.indexOf(GUTTERS_CLASS), 1);
      }
    }
    return needRefresh && gutters;
  }

  function updateGutters(cm, guttersOption) {
    cm.options.gutters = guttersOption;
    const el = $('.' + GUTTERS_CLASS, cm.display.gutters);
    if (linter && !el) {
      cm.display.gutters.appendChild($create('.CodeMirror-gutter ' + GUTTERS_CLASS));
    } else if (!linter && el) {
      el.remove();
    }
  }
}

function updateLintReport(cm, delay) {
  const state = cm && cm.state && cm.state.lint || {};
  if (delay === 0) {
    // immediately show pending csslint/stylelint messages in onbeforeunload and save
    clearTimeout(state.lintTimeout);
    updateLintReportInternal(cm);
    return;
  }
  if (delay > 0) {
    clearTimeout(state.lintTimeout);
    state.lintTimeout = setTimeout(cm => {
      if (cm.performLint) {
        cm.performLint();
        updateLintReportInternal(cm);
      }
    }, delay, cm);
    return;
  }
  if (state.options) {
    clearTimeout(state.reportTimeout);
    const delay = cm && cm.state.renderLintReportNow ? 0 : state.options.delay + 100;
    state.reportTimeout = setTimeout(updateLintReportInternal, delay, cm, {
      postponeNewIssues: delay === undefined || delay === null
    });
  }
}

function updateLintReportInternal(scope, {postponeNewIssues} = {}) {
  const {changed, fixedSome} = (scope ? [scope] : editors).reduce(process, {});
  if (changed) {
    const renderNow = editors.last.state.renderLintReportNow =
      !postponeNewIssues || fixedSome || editors.last.state.renderLintReportNow;
    debounce(renderLintReport, renderNow ? 0 : CodeMirror.defaults.lintReportDelay, true);
  }

  function process(result, cm) {
    const lintState = cm.state.lint || {};
    const oldMarkers = lintState.stylusMarkers || new Map();
    const newMarkers = lintState.stylusMarkers = new Map();
    const oldText = (lintState.body || {}).textContentCached || '';
    const activeLine = cm.getCursor().line;
    const body = !(lintState.marked || {}).length ? {} :
      $create('tbody', lintState.marked.map(mark => {
        const info = mark.__annotation;
        const {line, ch} = info.from;
        const isActiveLine = line === activeLine;
        const pos = isActiveLine ? 'cursor' : (line + ',' + ch);
        const title = clipString(info.message, 1000) + `\n(${info.rule})`;
        const message = clipString(info.message, 100);
        if (isActiveLine || oldMarkers[pos] === message) {
          oldMarkers.delete(pos);
        }
        newMarkers.set(pos, message);
        return $create(`tr.${info.severity}`, [
          $create('td', {attributes: {role: 'severity'}, dataset: {rule: info.rule}},
            $create('.CodeMirror-lint-marker-' + info.severity, info.severity)),
          $create('td', {attributes: {role: 'line'}}, line + 1),
          $create('td', {attributes: {role: 'sep'}}, ':'),
          $create('td', {attributes: {role: 'col'}}, ch + 1),
          $create('td', {attributes: {role: 'message'}, title}, message),
        ]);
      }));
    body.textContentCached = body.textContent || '';
    lintState.body = body.textContentCached && body;
    result.changed |= oldText !== body.textContentCached;
    result.fixedSome |= lintState.reportDisplayed && oldMarkers.size;
    return result;
  }

  function clipString(str, limit) {
    return str.length <= limit ? str : str.substr(0, limit) + '...';
  }
}

function renderLintReport(someBlockChanged) {
  const container = $('#lint');
  const content = container.children[1];
  const label = t('sectionCode');
  const newContent = content.cloneNode(false);
  let issueCount = 0;
  editors.forEach((cm, index) => {
    cm.state.renderLintReportNow = false;
    const lintState = cm.state.lint || {};
    const body = lintState.body;
    if (!body) {
      return;
    }
    const newBlock = $create('table', {cm}, [
      $create('caption', label + ' ' + (index + 1)),
      body,
    ]);
    newContent.appendChild(newBlock);
    issueCount += newBlock.rows.length;

    const block = content.children[newContent.children.length - 1];
    const blockChanged =
      !block ||
      block.cm !== cm ||
      body.textContentCached !== block.textContentCached;
    someBlockChanged |= blockChanged;
    lintState.reportDisplayed = blockChanged;
  });
  if (someBlockChanged || newContent.children.length !== content.children.length) {
    $('#issue-count').textContent = issueCount;
    container.replaceChild(newContent, content);
    container.classList.toggle('hidden', !newContent.children.length);
  }
}

function gotoLintIssue(event) {
  const issue = event.target.closest('tr');
  if (!issue) {
    return;
  }
  const block = issue.closest('table');
  makeSectionVisible(block.cm);
  block.cm.focus();
  block.cm.setSelection({
    line: parseInt($('td[role="line"]', issue).textContent) - 1,
    ch: parseInt($('td[role="col"]', issue).textContent) - 1
  });
}

function showLintHelp() {
  const linter = linterConfig.getName();
  const baseUrl = linter === 'stylelint'
    ? 'https://stylelint.io/user-guide/rules/'
    // some CSSLint rules do not have a url
    : 'https://github.com/CSSLint/csslint/issues/535';
  let headerLink, template, csslintRules;
  if (linter === 'csslint') {
    headerLink = $createLink('https://github.com/CSSLint/csslint/wiki/Rules-by-ID', 'CSSLint');
    template = ruleID => {
      const rule = csslintRules.find(rule => rule.id === ruleID);
      return rule &&
        $create('li', [
          $create('b', $createLink(rule.url || baseUrl, rule.name)),
          $create('br'),
          rule.desc,
        ]);
    };
  } else {
    headerLink = $createLink(baseUrl, 'stylelint');
    template = rule =>
      $create('li',
        rule === 'CssSyntaxError' ? rule : $createLink(baseUrl + rule, rule));
  }
  const header = t('linterIssuesHelp', '\x01').split('\x01');
  const activeRules = new Set($$('#lint td[role="severity"]').map(el => el.dataset.rule));
  Promise.resolve(linter !== 'csslint' || linterConfig.invokeWorker({action: 'getAllRuleInfos'}))
    .then(data => {
      csslintRules = data;
      showHelp(t('linterIssues'),
        $create([
          header[0], headerLink, header[1],
          $create('ul.rules', [...activeRules.values()].map(template)),
        ])
      );
    });
}

function showLinterErrorMessage(title, contents, popup) {
  messageBox({
    title,
    contents,
    className: 'danger center lint-config',
    buttons: [t('confirmOK')],
  }).then(() => popup && popup.codebox && popup.codebox.focus());
}

function setupLinterPopup(config) {
  const linter = linterConfig.getName();
  const linterTitle = linter === 'stylelint' ? 'Stylelint' : 'CSSLint';
  const defaultConfig = linterConfig.stringify(linterConfig.defaults[linter] || {});
  const title = t('linterConfigPopupTitle', linterTitle);
  const popup = showCodeMirrorPopup(title, null, {
    lint: false,
    extraKeys: {'Ctrl-Enter': save},
    hintOptions: {hint},
  });
  $('.contents', popup).appendChild(makeFooter());

  let cm = popup.codebox;
  cm.focus();
  cm.setValue(config);
  cm.clearHistory();
  cm.markClean();
  cm.on('changes', updateButtonState);
  updateButtonState();

  cm.rerouteHotkeys(false);
  window.addEventListener('closeHelp', function _() {
    window.removeEventListener('closeHelp', _);
    cm.rerouteHotkeys(true);
    cm = null;
  });

  loadScript([
    '/vendor/codemirror/mode/javascript/javascript.js',
    '/vendor/codemirror/addon/lint/json-lint.js',
    '/vendor/jsonlint/jsonlint.js'
  ]).then(() => {
    cm.setOption('mode', 'application/json');
    cm.setOption('lint', 'json');
  });

  function makeFooter() {
    return $create('div', [
      $create('p', [
        $createLink(
          linter === 'stylelint'
            ? 'https://stylelint.io/user-guide/rules/'
            : 'https://github.com/CSSLint/csslint/wiki/Rules-by-ID',
          t('linterRulesLink')),
        linter === 'csslint' ? ' ' + t('linterCSSLintSettings') : '',
      ]),
      $create('button.save', {onclick: save, title: 'Ctrl-Enter'}, t('styleSaveLabel')),
      $create('button.cancel', {onclick: cancel}, t('confirmClose')),
      $create('button.reset', {onclick: reset, title: t('linterResetMessage')}, t('genericResetLabel')),
      $create('span.saved-message', t('genericSavedMessage')),
    ]);
  }

  function save(event) {
    if (event instanceof Event) {
      event.preventDefault();
    }
    const json = tryJSONparse(cm.getValue());
    if (!json) {
      showLinterErrorMessage(linter, t('linterJSONError'), popup);
      cm.focus();
      return;
    }
    linterConfig.findInvalidRules(json, linter).then(invalid => {
      if (invalid.length) {
        showLinterErrorMessage(linter, [
          t('linterInvalidConfigError'),
          $create('ul', invalid.map(name => $create('li', name))),
        ], popup);
        return;
      }
      linterConfig.setLinter(linter);
      linterConfig.save(json);
      linterConfig.showSavedMessage();
      cm.markClean();
      cm.focus();
      updateButtonState();
    });
  }

  function reset(event) {
    event.preventDefault();
    linterConfig.setLinter(linter);
    cm.setValue(defaultConfig);
    cm.focus();
    updateButtonState();
  }

  function cancel(event) {
    event.preventDefault();
    $('.dismiss').dispatchEvent(new Event('click'));
  }

  function updateButtonState() {
    $('.save', popup).disabled = cm.isClean();
    $('.reset', popup).disabled = cm.getValue() === defaultConfig;
    $('.cancel', popup).textContent = t(cm.isClean() ? 'confirmClose' : 'confirmCancel');
  }

  function hint(cm) {
    return Promise.all([
      linterConfig.getAllRuleIds(linter),
      linter !== 'stylelint' || hint.allOptions ||
        linterConfig.invokeWorker({action: 'getAllRuleOptions', linter})
          .then(options => (hint.allOptions = options)),
    ])
    .then(([ruleIds, options]) => {
      const cursor = cm.getCursor();
      const {start, end, string, type, state: {lexical}} = cm.getTokenAt(cursor);
      const {line, ch} = cursor;

      const quoted = string.startsWith('"');
      const leftPart = string.slice(quoted ? 1 : 0, ch - start).trim();
      const depth = getLexicalDepth(lexical);

      const search = cm.getSearchCursor(/"([-\w]+)"/, {line, ch: start - 1});
      let [, prevWord] = search.find(true) || [];
      let words = [];

      if (depth === 1 && linter === 'stylelint') {
        words = quoted ? ['rules'] : [];
      } else if ((depth === 1 || depth === 2) && type && type.includes('property')) {
        words = ruleIds;
      } else if (depth === 2 || depth === 3 && lexical.type === ']') {
        words = !quoted ? ['true', 'false', 'null'] :
          ruleIds.includes(prevWord) && (options[prevWord] || [])[0] || [];
      } else if (depth === 4 && prevWord === 'severity') {
        words = ['error', 'warning'];
      } else if (depth === 4) {
        words = ['ignore', 'ignoreAtRules', 'except', 'severity'];
      } else if (depth === 5 && lexical.type === ']' && quoted) {
        while (prevWord && !ruleIds.includes(prevWord)) {
          prevWord = (search.find(true) || [])[1];
        }
        words = (options[prevWord] || []).slice(-1)[0] || ruleIds;
      }
      return {
        list: words.filter(word => word.startsWith(leftPart)),
        from: {line, ch: start + (quoted ? 1 : 0)},
        to: {line, ch: string.endsWith('"') ? end - 1 : end},
      };
    });
  }

  function getLexicalDepth(lexicalState) {
    let depth = 0;
    while ((lexicalState = lexicalState.prev)) {
      depth++;
    }
    return depth;
  }
}

function loadLinterAssets(name = linterConfig.getName()) {
  const worker = linterConfig.worker[name];
  return !name || !worker || worker.instance ? Promise.resolve() :
    loadScript((worker.instance ? [] : [
      (worker.instance = new Worker(worker.path)),
      `/edit/lint-defaults-${name}.js`,
    ]).concat(CodeMirror.lint ? [] : [
      '/vendor/codemirror/addon/lint/lint.css',
      '/msgbox/msgbox.css',
      '/vendor/codemirror/addon/lint/lint.js',
      '/edit/lint-codemirror-helper.js',
      '/msgbox/msgbox.js'
    ]));
}
