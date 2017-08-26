/* global CodeMirror messageBox */
/* global editors makeSectionVisible showCodeMirrorPopup showHelp */
/* global stylelintDefaultConfig csslintDefaultRuleset onDOMscripted injectCSS require */
'use strict';

function initLint() {
  $('#lint-help').addEventListener('click', showLintHelp);
  $('#lint').addEventListener('click', gotoLintIssue);
  window.addEventListener('resize', resizeLintReport);
  $('#linter-settings').addEventListener('click', openStylelintSettings);

  // touch devices don't have onHover events so the element we'll be toggled via clicking (touching)
  if ('ontouchstart' in document.body) {
    $('#lint h2').addEventListener('click', toggleLintReport);
  }
  // initialize storage of rules
  BG.chromeSync.getValue('editorStylelintRules').then(rules => setStylelintRules(rules));
  BG.chromeSync.getValue('editorCSSLintRules').then(ruleset => setCSSLintRules(ruleset));
}

function setStylelintRules(rules) {
  // can't use default parameters, because rules may be null
  if (Object.keys(rules || []).length === 0 && typeof stylelintDefaultConfig !== 'undefined') {
    rules = deepCopy(stylelintDefaultConfig.rules);
  }
  BG.chromeSync.setValue('editorStylelintRules', rules);
  return rules;
}

function setCSSLintRules(ruleset) {
  if (Object.keys(ruleset || []).length === 0 && typeof csslintDefaultRuleset !== 'undefined') {
    ruleset = Object.assign({}, csslintDefaultRuleset);
  }
  BG.chromeSync.setValue('editorCSSLintRules', ruleset);
  return ruleset;
}

function getLinterConfigForCodeMirror(name) {
  return CodeMirror.lint && CodeMirror.lint[name] ? {
    getAnnotations: CodeMirror.lint[name],
    delay: prefs.get('editor.lintDelay')
  } : false;
}

function updateLinter(linter) {
  function updateEditors() {
    const options = getLinterConfigForCodeMirror(linter);
    CodeMirror.defaults.lint = options === 'null' ? false : options;
    editors.forEach(cm => {
      // set lint to "null" to disable
      cm.setOption('lint', options);
      // enabling/disabling linting changes the gutter width
      cm.refresh();
      updateLintReport(cm, 200);
    });
  }
  // load scripts
  loadSelectedLinter(linter).then(() => {
    updateEditors();
  });
  $('#linter-settings').style.display = linter === 'null' ? 'none' : 'inline-block';
}

function updateLintReport(cm, delay) {
  if (delay === 0) {
    // immediately show pending csslint/stylelint messages in onbeforeunload and save
    update(cm);
    return;
  }
  if (delay > 0) {
    setTimeout(cm => {
      cm.performLint();
      update(cm);
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
    const scope = cm ? [cm] : editors;
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
          // stylelint rule added in parentheses at the end; extract it out for the stylelint info popup
          const lintRuleName = info.message
            .substring(info.message.lastIndexOf('('), info.message.length)
            .replace(/[()]/g, '');
          const title = escapeHtml(info.message);
          const message = title.length > 100 ? title.substr(0, 100) + '...' : title;
          if (isActiveLine || oldMarkers[pos] === message) {
            delete oldMarkers[pos];
          }
          newMarkers[pos] = message;
          return `<tr class="${info.severity}">
            <td role="severity" data-rule="${lintRuleName}">
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
  function escapeHtml(html) {
    const chars = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'};
    return html.replace(/[&<>"'/]/g, char => chars[char]);
  }
}

function renderLintReport(someBlockChanged) {
  const container = $('#lint');
  const content = container.children[1];
  const label = t('sectionCode');
  const newContent = content.cloneNode(false);
  let issueCount = 0;
  editors.forEach((cm, index) => {
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
  const makeLink = (url, txt) => `<a target="_blank" href="${url}">${txt}</a>`;
  const linter = prefs.get('editor.linter');
  const url = linter === 'stylelint'
    ? 'https://stylelint.io/user-guide/rules/'
    // some CSSLint rules do not have a url
    : 'https://github.com/CSSLint/csslint/issues/535';
  const rules = [];
  let template;
  let list = '<ul class="rules">';
  let header = '';
  if (linter === 'csslint') {
    const CSSLintRules = window.CSSLint.getRules();
    const findCSSLintRule = id => CSSLintRules.find(rule => rule.id === id);
    header = t('issuesHelp', makeLink('https://github.com/CSSLint/csslint/wiki/Rules-by-ID', 'CSSLint'));
    template = ruleID => {
      const rule = findCSSLintRule(ruleID);
      return rule ? `<li><b>${makeLink(rule.url || url, rule.name)}</b><br>${rule.desc}</li>` : '';
    };
  } else {
    header = t('issuesHelp', makeLink(url, 'stylelint'));
    template = rule => `<li>${makeLink(url + rule, rule)}</li>`;
  }
  // to-do: change this to a generator
  $$('#lint td[role="severity"]').forEach(el => {
    const rule = el.dataset.rule;
    if (!rules.includes(rule)) {
      list += template(rule);
      rules.push(rule);
    }
  });
  return showHelp(t('issues'), header + list + '</ul>');
}

function showLinterErrorMessage(title, contents) {
  messageBox({
    title,
    contents,
    className: 'danger center lint-config',
    buttons: [t('confirmOK')],
  });
}

function showSavedMessage() {
  $('#help-popup .saved-message').classList.add('show');
  clearTimeout($('#help-popup .contents').timer);
  $('#help-popup .contents').timer = setTimeout(() => {
    // popup may be closed at this point
    const msg = $('#help-popup .saved-message');
    if (msg) {
      msg.classList.remove('show');
    }
  }, 2000);
}

function checkLinter(linter = prefs.get('editor.linter')) {
  linter = linter.toLowerCase();
  if (prefs.get('editor.linter') !== linter) {
    prefs.set('editor.linter', linter);
  }
  return linter;
}

function checkRules(linter, rules) {
  const invalid = [];
  const linterRules = linter === 'stylelint'
    ? Object.keys(window.stylelint.rules)
    : window.CSSLint.getRules().map(rule => rule.id);
  Object.keys(rules).forEach(rule => {
    if (!linterRules.includes(rule)) {
      invalid.push(rule);
    }
  });
  return invalid;
}

function stringifyRules(rules) {
  return JSON.stringify(rules, null, 2)
    .replace(/,\n\s+\{\n\s+("severity":\s"\w+")\n\s+\}/g, ', {$1}');
}

function setupLinterSettingsEvents(popup) {
  $('.save', popup).addEventListener('click', event => {
    event.preventDefault();
    const linter = checkLinter(event.target.dataset.linter);
    const json = tryJSONparse(popup.codebox.getValue());
    if (json) {
      const invalid = checkRules(linter, json);
      if (invalid.length) {
        return showLinterErrorMessage(
          linter,
          t('setLinterInvalidRuleError') + `<ul><li>${invalid.join('</li><li>')}</li></ul>`
        );
      }
      if (linter === 'stylelint') {
        setStylelintRules(json);
      } else {
        setCSSLintRules(json);
      }
      updateLinter(linter);
      showSavedMessage();
    } else {
      showLinterErrorMessage(linter, t('setLinterError'));
    }
  });
  $('.reset', popup).addEventListener('click', event => {
    event.preventDefault();
    const linter = checkLinter(event.target.dataset.linter);
    let rules;
    if (linter === 'stylelint') {
      setStylelintRules();
      rules = stylelintDefaultConfig.rules;
    } else {
      setCSSLintRules();
      rules = csslintDefaultRuleset;
    }
    popup.codebox.setValue(stringifyRules(rules));
    updateLinter(linter);
  });
  $('.cancel', popup).addEventListener('click', event => {
    event.preventDefault();
    $('.dismiss').dispatchEvent(new Event('click'));
  });
}

function openStylelintSettings() {
  const linter = prefs.get('editor.linter');
  BG.chromeSync.getValue(
    linter === 'stylelint'
      ? 'editorStylelintRules'
      : 'editorCSSLintRules'
  ).then(rules => {
    if (!rules || rules.length === 0) {
      rules = linter === 'stylelint'
        ? setStylelintRules(rules)
        : setCSSLintRules(rules);
    }
    const rulesString = stringifyRules(rules);
    setupLinterPopup(rulesString);
  });
}

function setupLinterPopup(rules) {
  const linter = prefs.get('editor.linter');
  const linterTitle = linter === 'stylelint' ? 'Stylelint' : 'CSSLint';
  function makeButton(className, text) {
    return $element({tag: 'button', className, type: 'button', textContent: t(text), dataset: {linter}});
  }
  function makeLink(url, textContent) {
    return $element({tag: 'a', target: '_blank', href: url, textContent});
  }
  function setJSONMode(cm) {
    cm.setOption('mode', 'application/json');
    cm.setOption('lint', 'json');
  }
  const popup = showCodeMirrorPopup(t('setLinterRulesTitle', linterTitle), $element({
    appendChild: [
      $element({
        tag: 'p',
        appendChild: [
          t('setLinterLink') + ' ',
          makeLink(
            linter === 'stylelint'
              ? 'https://stylelint.io/demo/'
              : 'https://github.com/CSSLint/csslint/wiki/Rules-by-ID',
            linterTitle
          ),
          linter === 'csslint' ? ' ' + t('showCSSLintSettings') : ''
        ]
      }),
      makeButton('save', 'styleSaveLabel'),
      makeButton('cancel', 'confirmCancel'),
      makeButton('reset', 'genericResetLabel'),
      $element({
        tag: 'span',
        className: 'saved-message',
        textContent: t('genericSavedMessage')
      })
    ]
  }));
  const contents = $('.contents', popup);
  const loadJSON = window.jsonlint ? [] : [
    'vendor/codemirror/mode/javascript/javascript.js',
    'vendor/codemirror/addon/lint/json-lint.js',
    'vendor/jsonlint/jsonlint.js'
  ];
  contents.insertBefore(popup.codebox.display.wrapper, contents.firstElementChild);
  popup.codebox.focus();
  popup.codebox.setValue(rules);
  onDOMscripted(loadJSON).then(() => setJSONMode(popup.codebox));
  setupLinterSettingsEvents(popup);
}

function loadSelectedLinter(name) {
  const scripts = [];
  if (name !== 'null' && !$('script[src*="css-lint.js"]')) {
    // inject css
    injectCSS('vendor/codemirror/addon/lint/lint.css');
    injectCSS('msgbox/msgbox.css');
    // load CodeMirror lint code
    scripts.push(
      'vendor/codemirror/addon/lint/lint.js',
      'vendor-overwrites/codemirror/addon/lint/css-lint.js',
      'msgbox/msgbox.js'
    );
  }
  if (name === 'csslint' && !window.CSSLint) {
    scripts.push(
      'edit/csslint-ruleset.js',
      'vendor-overwrites/csslint/csslint-worker.js'
    );
  } else if (name === 'stylelint' && !window.stylelint) {
    scripts.push(
      'vendor-overwrites/stylelint/stylelint-bundle.min.js',
      'edit/stylelint-config.js'
    );
  }
  return onDOMscripted(scripts);
}
