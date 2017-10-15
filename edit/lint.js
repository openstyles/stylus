/* global CodeMirror messageBox */
/* global editors makeSectionVisible showCodeMirrorPopup showHelp */
/* global loadScript require CSSLint stylelint */
/* global makeLink */
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

  getDefault() {
    // some dirty hacks to override editor.linter getting from prefs
    const linter = prefs.get('editor.linter');
    if (linter && editors[0] && editors[0].getOption('mode') !== 'css') {
      return 'stylelint';
    }
    return linter;
  },

  getCurrent(linter = linterConfig.getDefault()) {
    return this.fallbackToDefaults(this[linter] || {});
  },

  getForCodeMirror(linter = linterConfig.getDefault()) {
    return CodeMirror.lint && CodeMirror.lint[linter] ? {
      getAnnotations: CodeMirror.lint[linter],
      delay: prefs.get('editor.lintDelay'),
    } : false;
  },

  getName(cmLintOption) {
    if (!cmLintOption) {
      return null;
    }
    for (const linter of ['csslint', 'stylelint']) {
      if (cmLintOption.getAnnotations === CodeMirror.lint[linter]) {
        return linter;
      }
    }
    return null;
  },

  fallbackToDefaults(config, linter = linterConfig.getDefault()) {
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

  setLinter(linter = linterConfig.getDefault()) {
    linter = linter.toLowerCase();
    linter = linter === 'csslint' || linter === 'stylelint' ? linter : '';
    if (linterConfig.getDefault() !== linter) {
      prefs.set('editor.linter', linter);
    }
    return linter;
  },

  findInvalidRules(config, linter = linterConfig.getDefault()) {
    const rules = linter === 'stylelint' ? config.rules : config;
    const allRules = new Set(
      linter === 'stylelint'
      ? Object.keys(stylelint.rules)
      : CSSLint.getRules().map(rule => rule.id)
    );
    return Object.keys(rules).filter(rule => !allRules.has(rule));
  },

  stringify(config = this.getCurrent()) {
    if (linterConfig.getDefault() === 'stylelint') {
      config.syntax = undefined;
    }
    return JSON.stringify(config, null, 2)
      .replace(/,\n\s+\{\n\s+("severity":\s"\w+")\n\s+\}/g, ', {$1}');
  },

  save(config) {
    config = this.fallbackToDefaults(config);
    const linter = linterConfig.getDefault();
    this[linter] = config;
    BG.chromeSync.setLZValue(this.storageName[linter], config);
    return config;
  },

  loadAll() {
    return BG.chromeSync.getLZValues([
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
  openOnClick() {
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
    if (!linterConfig.init.pending) {
      linterConfig.init.pending = linterConfig.loadAll();
    }
    return linterConfig.init.pending;
  }
};

function initLint() {
  $('#lint-help').addEventListener('click', showLintHelp);
  $('#lint').addEventListener('click', gotoLintIssue);
  $('#linter-settings').addEventListener('click', linterConfig.openOnClick);
  window.addEventListener('resize', resizeLintReport);

  // touch devices don't have onHover events so the element we'll be toggled via clicking (touching)
  if ('ontouchstart' in document.body) {
    $('#lint h2').addEventListener('click', toggleLintReport);
  }

  updateLinter();
  linterConfig.watchStorage();
  prefs.subscribe(['editor.linter'], updateLinter);
}

function updateLinter({immediately, linter = linterConfig.getDefault()} = {}) {
  if (!immediately) {
    debounce(updateLinter, 0, {immediately: true, linter});
    return;
  }
  const GUTTERS_CLASS = 'CodeMirror-lint-markers';

  Promise.all([linterConfig.init(), loadLinterAssets(linter)])
    .then(updateEditors);
  $('#linter-settings').style.display = !linter ? 'none' : 'inline-block';
  $('#lint').style.display = 'none';

  function updateEditors() {
    CodeMirror.defaults.lint = linterConfig.getForCodeMirror(linter);
    const guttersOption = prepareGuttersOption();
    editors.forEach(cm => {
      cm.setOption('lint', CodeMirror.defaults.lint);
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
      cm.display.gutters.appendChild($element({
        className: 'CodeMirror-gutter ' + GUTTERS_CLASS
      }));
    } else if (!linter && el) {
      el.remove();
    }
  }
}

function updateLintReport(cm, delay) {
  if (cm && !cm.options.lint) {
    // add 'lint' option back to the freshly created section
    setTimeout(() => {
      if (!cm.options.lint) {
        cm.setOption('lint', linterConfig.getForCodeMirror());
      }
    });
  }
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
    const body = !(lintState.marked || {}).length ? {} : $element({
      tag: 'tbody',
      appendChild: lintState.marked.map(mark => {
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
        return $element({
          tag: 'tr',
          className: info.severity,
          appendChild: [
            $element({
              tag: 'td',
              attributes: {role: 'severity'},
              dataset: {rule: info.rule},
              appendChild: $element({
                className: 'CodeMirror-lint-marker-' + info.severity,
                textContent: info.severity,
              }),
            }),
            $element({tag: 'td', attributes: {role: 'line'}, textContent: line + 1}),
            $element({tag: 'td', attributes: {role: 'sep'}, textContent: ':'}),
            $element({tag: 'td', attributes: {role: 'col'}, textContent: ch + 1}),
            $element({tag: 'td', attributes: {role: 'message'}, textContent: message, title}),
          ],
        });
      })
    });
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
    const newBlock = $element({
      tag: 'table',
      appendChild: [
        $element({tag: 'caption', textContent: label + ' ' + (index + 1)}),
        body,
      ],
      cm,
    });
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
    container.style.display = newContent.children.length ? 'block' : 'none';
    resizeLintReport();
  }
}

function resizeLintReport() {
  // subtracted value to prevent scrollbar
  const magicBuffer = 20;
  const content = $('#lint table');
  if (content) {
    const bounds = content.getBoundingClientRect();
    const newMaxHeight = bounds.bottom <= window.innerHeight ? '' :
      // subtract out a bit of padding or the vertical scrollbar extends beyond the viewport
      (window.innerHeight - bounds.top - magicBuffer) + 'px';
    if (newMaxHeight !== content.style.maxHeight) {
      content.parentNode.style.maxHeight = newMaxHeight;
    }
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

function toggleLintReport() {
  $('#lint').classList.toggle('collapsed');
}

function showLintHelp() {
  const linter = linterConfig.getDefault();
  const baseUrl = linter === 'stylelint'
    ? 'https://stylelint.io/user-guide/rules/'
    // some CSSLint rules do not have a url
    : 'https://github.com/CSSLint/csslint/issues/535';
  let headerLink, template;
  if (linter === 'csslint') {
    const CSSLintRules = CSSLint.getRules();
    headerLink = makeLink('https://github.com/CSSLint/csslint/wiki/Rules-by-ID', 'CSSLint');
    template = ruleID => {
      const rule = CSSLintRules.find(rule => rule.id === ruleID);
      return rule &&
        $element({tag: 'li', appendChild: [
          $element({tag: 'b', appendChild: makeLink(rule.url || baseUrl, rule.name)}),
          $element({tag: 'br'}),
          rule.desc,
        ]});
    };
  } else {
    headerLink = makeLink(baseUrl, 'stylelint');
    template = rule =>
      $element({
        tag: 'li',
        appendChild: makeLink(baseUrl + rule, rule),
      });
  }
  const header = t('linterIssuesHelp', '\x01').split('\x01');
  const activeRules = new Set($$('#lint td[role="severity"]').map(el => el.dataset.rule));
  return showHelp(t('linterIssues'),
    $element({appendChild: [
      header[0], headerLink, header[1],
      $element({
        tag: 'ul',
        className: 'rules',
        appendChild: [...activeRules.values()].map(template),
      }),
    ]})
  );
}

function showLinterErrorMessage(title, contents) {
  messageBox({
    title,
    contents,
    className: 'danger center lint-config',
    buttons: [t('confirmOK')],
  });
}

function setupLinterSettingsEvents(popup) {
  $('.save', popup).addEventListener('click', event => {
    event.preventDefault();
    const linter = linterConfig.setLinter(event.target.dataset.linter);
    const json = tryJSONparse(popup.codebox.getValue());
    if (json) {
      const invalid = linterConfig.findInvalidRules(json, linter);
      if (invalid.length) {
        showLinterErrorMessage(linter, [
          t('linterInvalidConfigError'),
          $element({
            tag: 'ul',
            appendChild: invalid.map(name =>
              $element({tag: 'li', textContent: name})),
          }),
        ]);
        return;
      }
      linterConfig.save(json);
      linterConfig.showSavedMessage();
      popup.codebox.markClean();
    } else {
      showLinterErrorMessage(linter, t('linterJSONError'));
    }
    popup.codebox.focus();
  });
  $('.reset', popup).addEventListener('click', event => {
    event.preventDefault();
    const linter = linterConfig.setLinter(event.target.dataset.linter);
    popup.codebox.setValue(linterConfig.stringify(linterConfig.defaults[linter] || {}));
    popup.codebox.focus();
  });
  $('.cancel', popup).addEventListener('click', event => {
    event.preventDefault();
    $('.dismiss').dispatchEvent(new Event('click'));
  });
}

function setupLinterPopup(config) {
  const linter = linterConfig.getDefault();
  const linterTitle = linter === 'stylelint' ? 'Stylelint' : 'CSSLint';

  function makeButton(className, text, options = {}) {
    return $element(Object.assign(options, {
      tag: 'button',
      className,
      type: 'button',
      textContent: t(text),
      dataset: {linter}
    }));
  }
  function makeLink(url, textContent) {
    return $element({tag: 'a', target: '_blank', href: url, textContent});
  }

  const title = t('linterConfigPopupTitle', linterTitle);
  const contents = $element({
    appendChild: [
      $element({
        tag: 'p',
        appendChild: [
          t('linterRulesLink') + ' ',
          makeLink(
            linter === 'stylelint'
              ? 'https://stylelint.io/user-guide/rules/'
              : 'https://github.com/CSSLint/csslint/wiki/Rules-by-ID',
            linterTitle
          ),
          linter === 'csslint' ? ' ' + t('linterCSSLintSettings') : ''
        ]
      }),
      makeButton('save', 'styleSaveLabel', {disabled: true}),
      makeButton('cancel', 'confirmCancel'),
      makeButton('reset', 'genericResetLabel', {title: t('linterResetMessage')}),
      $element({
        tag: 'span',
        className: 'saved-message',
        textContent: t('genericSavedMessage')
      })
    ]
  });
  const popup = showCodeMirrorPopup(title, contents, {lint: false});
  contents.parentNode.appendChild(contents);
  popup.codebox.focus();
  popup.codebox.setValue(config);
  popup.codebox.clearHistory();
  popup.codebox.markClean();
  popup.codebox.on('change', cm => {
    $('.save', popup).disabled = cm.isClean();
  });
  setupLinterSettingsEvents(popup);
  loadScript([
    '/vendor/codemirror/mode/javascript/javascript.js',
    '/vendor/codemirror/addon/lint/json-lint.js',
    '/vendor/jsonlint/jsonlint.js'
  ]).then(() => {
    popup.codebox.setOption('mode', 'application/json');
    popup.codebox.setOption('lint', 'json');
  });
}

function loadLinterAssets(name = linterConfig.getDefault()) {
  if (!name) {
    return Promise.resolve();
  }
  return loadLibrary().then(loadAddon);

  function loadLibrary() {
    if (name === 'csslint' && !window.CSSLint) {
      return loadScript([
        '/vendor-overwrites/csslint/csslint-worker.js',
        '/edit/lint-defaults-csslint.js'
      ]);
    }
    if (name === 'stylelint' && !window.stylelint) {
      return loadScript([
        '/vendor-overwrites/stylelint/stylelint-bundle.min.js',
        '/edit/lint-defaults-stylelint.js'
      ]).then(() => (window.stylelint = require('stylelint')));
    }
    return Promise.resolve();
  }

  function loadAddon() {
    if (CodeMirror.lint) {
      return;
    }
    return loadScript([
      '/vendor/codemirror/addon/lint/lint.css',
      '/msgbox/msgbox.css',
      '/vendor/codemirror/addon/lint/lint.js',
      '/edit/lint-codemirror-helper.js',
      '/msgbox/msgbox.js'
    ]);
  }
}
