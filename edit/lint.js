/* global CodeMirror messageBox */
/* global editors makeSectionVisible showCodeMirrorPopup showHelp */
/* global onDOMscripted injectCSS require CSSLint stylelint */
'use strict';

loadLinterAssets();

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

  getCurrent(linter = prefs.get('editor.linter')) {
    return this.fallbackToDefaults(this[linter] || {});
  },

  getForCodeMirror(linter = prefs.get('editor.linter')) {
    return CodeMirror.lint && CodeMirror.lint[linter] ? {
      getAnnotations: CodeMirror.lint[linter],
      delay: prefs.get('editor.lintDelay'),
    } : false;
  },

  fallbackToDefaults(config, linter = prefs.get('editor.linter')) {
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

  setLinter(linter = prefs.get('editor.linter')) {
    linter = linter.toLowerCase();
    linter = linter === 'csslint' || linter === 'stylelint' ? linter : '';
    if (prefs.get('editor.linter') !== linter) {
      prefs.set('editor.linter', linter);
    }
    return linter;
  },

  findInvalidRules(config, linter = prefs.get('editor.linter')) {
    const rules = linter === 'stylelint' ? config.rules : config;
    const allRules = new Set(
      linter === 'stylelint'
      ? Object.keys(stylelint.rules)
      : CSSLint.getRules().map(rule => rule.id)
    );
    return Object.keys(rules).filter(rule => !allRules.has(rule));
  },

  stringify(config = this.getCurrent()) {
    if (prefs.get('editor.linter') === 'stylelint') {
      config.syntax = undefined;
    }
    return JSON.stringify(config, null, 2)
      .replace(/,\n\s+\{\n\s+("severity":\s"\w+")\n\s+\}/g, ', {$1}');
  },

  save(config) {
    config = this.fallbackToDefaults(config);
    const linter = prefs.get('editor.linter');
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

  linterConfig.loadAll();
  linterConfig.watchStorage();
  prefs.subscribe(updateLinter, ['editor.linter']);
  updateLinter();
}

function updateLinter({immediately} = {}) {
  if (!immediately) {
    debounce(updateLinter, 0, {immediately: true});
    return;
  }
  const linter = prefs.get('editor.linter');
  const GUTTERS_CLASS = 'CodeMirror-lint-markers';

  function updateEditors() {
    CodeMirror.defaults.lint = linterConfig.getForCodeMirror(linter);
    const guttersOption = prepareGuttersOption();
    $$('#sections .CodeMirror').map(e => e.CodeMirror).forEach(cm => {
      cm.setOption('lint', CodeMirror.defaults.lint);
      if (guttersOption) {
        cm.setOption('guttersOption', guttersOption);
        updateGutters(cm, guttersOption);
      }
      cm.refresh();
      updateLintReport(cm);
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

  // load scripts
  loadLinterAssets(linter).then(() => {
    updateEditors();
  });
  $('#linter-settings').style.display = !linter ? 'none' : 'inline-block';
}

function updateLintReport(cm, delay) {
  if (delay === 0) {
    // immediately show pending csslint/stylelint messages in onbeforeunload and save
    update(cm);
    return;
  }
  if (delay > 0) {
    setTimeout(cm => {
      if (cm.performLint) {
        cm.performLint();
        update(cm);
      }
    }, delay, cm);
    return;
  }
  // eslint-disable-next-line no-var
  var state = cm.state.lint;
  if (!state) {
    return;
  }
  // user is editing right now: postpone updating the report for the new issues (default: 500ms lint + 4500ms)
  // or update it as soon as possible (default: 500ms lint + 100ms) in case an existing issue was just fixed
  clearTimeout(state.reportTimeout);
  state.reportTimeout = setTimeout(update, state.options.delay + 100, cm);
  state.postponeNewIssues = delay === undefined || delay === null;

  function update(cm) {
    const scope = cm ? [cm] : $$('#sections .CodeMirror').map(e => e.CodeMirror);
    let changed = false;
    let fixedOldIssues = false;
    scope.forEach(cm => {
      const scopedState = cm.state.lint || {};
      const oldMarkers = scopedState.markedLast || {};
      const newMarkers = {};
      const html = !scopedState.marked || scopedState.marked.length === 0 ? '' : '<tbody>' +
        scopedState.marked.map(mark => {
          const info = mark.__annotation;
          const isActiveLine = info.from.line === cm.getCursor().line;
          const pos = isActiveLine ? 'cursor' : (info.from.line + ',' + info.from.ch);
          // rule name added in parentheses at the end; extract it out for the info popup
          const text = info.message;
          const parenPos = text.endsWith(')') ? text.lastIndexOf('(') : text.length;
          const ruleName = text.slice(parenPos + 1, -1);
          const title = escapeHtml(text);
          const message = escapeHtml(text.substr(0, Math.min(100, parenPos)), {limit: 100});
          if (isActiveLine || oldMarkers[pos] === message) {
            delete oldMarkers[pos];
          }
          newMarkers[pos] = message;
          return `<tr class="${info.severity}">
            <td role="severity" data-rule="${ruleName}">
              <div class="CodeMirror-lint-marker-${info.severity}">${info.severity}</div>
            </td>
            <td role="line">${info.from.line + 1}</td>
            <td role="sep">:</td>
            <td role="col">${info.from.ch + 1}</td>
            <td role="message" title="${title}">${message}</td>
          </tr>`;
        }).join('') + '</tbody>';
      scopedState.markedLast = newMarkers;
      fixedOldIssues |= scopedState.reportDisplayed && Object.keys(oldMarkers).length > 0;
      if (scopedState.html !== html) {
        scopedState.html = html;
        changed = true;
      }
    });
    if (changed) {
      clearTimeout(state ? state.renderTimeout : undefined);
      if (!state || !state.postponeNewIssues || fixedOldIssues) {
        renderLintReport(true);
      } else {
        state.renderTimeout = setTimeout(() => {
          renderLintReport(true);
        }, CodeMirror.defaults.lintReportDelay);
      }
    }
  }
  function escapeHtml(html, {limit} = {}) {
    const chars = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'};
    let ellipsis = '';
    if (limit && html.length > limit) {
      html = html.substr(0, limit);
      ellipsis = '...';
    }
    return html.replace(/[&<>"'/]/g, char => chars[char]) + ellipsis;
  }
}

function renderLintReport(someBlockChanged) {
  const container = $('#lint');
  const content = container.children[1];
  const label = t('sectionCode');
  const newContent = content.cloneNode(false);
  let issueCount = 0;
  $$('#sections .CodeMirror').map(e => e.CodeMirror).forEach((cm, index) => {
    if (cm.state.lint && cm.state.lint.html) {
      const html = '<caption>' + label + ' ' + (index + 1) + '</caption>' + cm.state.lint.html;
      const newBlock = newContent.appendChild(tHTML(html, 'table'));

      newBlock.cm = cm;
      issueCount += newBlock.rows.length;

      const block = content.children[newContent.children.length - 1];
      const blockChanged = !block || cm !== block.cm || html !== block.innerHTML;
      someBlockChanged |= blockChanged;
      cm.state.lint.reportDisplayed = blockChanged;
    }
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
  const makeLink = (href, textContent) => $element({
    tag: 'a',
    target: '_blank',
    href,
    textContent,
  });
  const linter = prefs.get('editor.linter');
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
  const linter = prefs.get('editor.linter');
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
  onDOMscripted([
    'vendor/codemirror/mode/javascript/javascript.js',
    'vendor/codemirror/addon/lint/json-lint.js',
    'vendor/jsonlint/jsonlint.js'
  ]).then(() => {
    popup.codebox.setOption('mode', 'application/json');
    popup.codebox.setOption('lint', 'json');
  });
}

function loadLinterAssets(name = prefs.get('editor.linter')) {
  if (loadLinterAssets.loadingName === name) {
    return onDOMscripted();
  }
  loadLinterAssets.loadingName = name;
  const scripts = [];
  if (name === 'csslint' && !window.CSSLint) {
    scripts.push(
      'vendor-overwrites/csslint/csslint-worker.js',
      'edit/lint-defaults-csslint.js'
    );
  } else if (name === 'stylelint' && !window.stylelint) {
    scripts.push(
      'vendor-overwrites/stylelint/stylelint-bundle.min.js',
      () => (window.stylelint = require('stylelint')),
      'edit/lint-defaults-stylelint.js'
    );
  }
  if (name && !$('script[src$="vendor/codemirror/addon/lint/lint.js"]')) {
    injectCSS('vendor/codemirror/addon/lint/lint.css');
    injectCSS('msgbox/msgbox.css');
    scripts.push(
      'vendor/codemirror/addon/lint/lint.js',
      'edit/lint-codemirror-helper.js',
      'msgbox/msgbox.js'
    );
  }
  return onDOMscripted(scripts)
    .then(() => (loadLinterAssets.loadingName = null));
}
