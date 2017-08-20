/* global CodeMirror CSSLint editors makeSectionVisible showHelp showCodeMirrorPopup */
/* global stylelintDefaultConfig onDOMscripted injectCSS require */
'use strict';

function initLint() {
  $('#lint-help').addEventListener('click', showLintHelp);
  $('#lint').addEventListener('click', gotoLintIssue);
  window.addEventListener('resize', resizeLintReport);
  $('#stylelint-settings').addEventListener('click', openStylelintSettings);

  // touch devices don't have onHover events so the element we'll be toggled via clicking (touching)
  if ('ontouchstart' in document.body) {
    $('#lint h2').addEventListener('click', toggleLintReport);
  }
  BG.chromeLocal.getValue('editorStylelintRules').then(rules => setStylelintRules(rules));
}

function setStylelintRules(rules = []) {
  if (Object.keys(rules).length === 0 && typeof stylelintDefaultConfig !== 'undefined') {
    rules = deepCopy(stylelintDefaultConfig.rules);
  }
  BG.chromeLocal.setValue('editorStylelintRules', rules);
  return rules;
}

function getLinterConfigForCodeMirror(name) {
  return CodeMirror.lint && CodeMirror.lint[name] ? {
    getAnnotations: CodeMirror.lint[name],
    delay: prefs.get('editor.lintDelay')
  } : false;
}

function updateLinter(name) {
  function updateEditors() {
    const options = getLinterConfigForCodeMirror(name);
    CodeMirror.defaults.lint = options === 'null' ? false : options;
    editors.forEach(cm => {
      // set lint to "null" to disable
      cm.setOption('lint', options);
      // enabling/disabling linting changes the gutter width
      cm.refresh();
      updateLintReport(cm, 200);
    });
  }
  if (prefs.get('editor.linter') !== name) {
    prefs.set('editor.linter', name);
  }
  // load scripts
  loadSelectedLinter(name).then(() => {
    updateEditors();
  });
  $('#stylelint-settings').style.display = name === 'stylelint' ?
    'inline-block' : 'none';
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
      const linter = prefs.get('editor.linter');
      const scopedState = cm.state.lint || {};
      const oldMarkers = scopedState.markedLast || {};
      const newMarkers = {};
      const html = !scopedState.marked || scopedState.marked.length === 0 ? '' : '<tbody>' +
        scopedState.marked.map(mark => {
          const info = mark.__annotation;
          const isActiveLine = info.from.line === cm.getCursor().line;
          const pos = isActiveLine ? 'cursor' : (info.from.line + ',' + info.from.ch);
          // stylelint rule added in parentheses at the end
          const rule = linter === 'stylelint' ?
            info.message.substring(info.message.lastIndexOf('('), info.message.length).replace(/[()]/g, '') :
            / at line \d.+$/;
          // csslint
          const title = escapeHtml(info.message);
          const message = title.length > 100 ? title.substr(0, 100) + '...' : title;
          if (isActiveLine || oldMarkers[pos] === message) {
            delete oldMarkers[pos];
          }
          newMarkers[pos] = message;
          return `<tr class="${info.severity}">
            <td role="severity" ${linter === 'stylelint' ? 'data-rule="' + rule + '"' : ''}>
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
  let list = '<ul class="rules">';
  let header = '';
  if (prefs.get('editor.linter') === 'csslint') {
    header = t('issuesHelp', '<a href="https://github.com/CSSLint/csslint" target="_blank">CSSLint</a>');
    list += CSSLint.getRules().map(rule =>
      '<li><b>' + rule.name + '</b><br>' + rule.desc + '</li>'
    ).join('');
  } else {
    const rules = [];
    const url = 'https://stylelint.io/user-guide/rules/';
    header = t('issuesHelp', `<a href="${url}" target="_blank">stylelint</a>`);
    // to-do: change this to a generator
    $$('#lint td[role="severity"]').forEach(el => {
      const rule = el.dataset.rule;
      if (!rules.includes(rule)) {
        list += `<li><a target="_blank" href="${url}${rule}/">${rule}</a></li>`;
        rules.push(rule);
      }
    });
  }
  return showHelp(t('issues'), header + list + '</ul>');
}

function setupStylelintSettingsEvents(popup) {
  $('.save', popup).addEventListener('click', event => {
    event.preventDefault();
    const json = tryJSONparse(popup.codebox.getValue());
    if (json && json.rules) {
      setStylelintRules(json.rules);
      // it is possible to have stylelint rules popup open & switch to csslint
      if (prefs.get('editor.linter') === 'stylelint') {
        updateLinter('stylelint');
      }
    } else {
      $('#help-popup .error').classList.add('show');
      clearTimeout($('#help-popup .contents').timer);
      $('#help-popup .contents').timer = setTimeout(() => {
        // popup may be closed at this point
        const error = $('#help-popup .error');
        if (error) {
          error.classList.remove('show');
        }
      }, 3000);
    }
  });
  $('.reset', popup).addEventListener('click', event => {
    event.preventDefault();
    setStylelintRules();
    popup.codebox.setValue(JSON.stringify({rules: stylelintDefaultConfig.rules}, null, 2));
    if (prefs.get('editor.linter') === 'stylelint') {
      updateLinter('stylelint');
    }
  });
}

function openStylelintSettings() {
  BG.chromeLocal.getValue('editorStylelintRules').then(rules => {
    if (rules.length === 0) {
      rules = setStylelintRules(rules);
    }
    const rulesString = JSON.stringify({rules: rules}, null, 2);
    setupStylelintPopup(rulesString);
  });
}

function setupStylelintPopup(rules) {
  function makeButton(className, text) {
    return $element({tag: 'button', className, type: 'button', textContent: t(text)});
  }
  function makeLink(url, textContent) {
    return $element({tag: 'a', target: '_blank', href: url, textContent});
  }
  function setJSONMode(cm) {
    cm.setOption('mode', 'application/json');
    cm.setOption('lint', 'json');
  }
  const popup = showCodeMirrorPopup(t('setStylelintRules'), $element({
    appendChild: [
      $element({
        tag: 'p',
        appendChild: [
          t('setStylelintLink') + ' ',
          makeLink('https://stylelint.io/demo/', 'Stylelint')
        ]
      }),
      makeButton('save', 'styleSaveLabel'),
      makeButton('reset', 'resetStylelintRules'),
      $element({
        tag: 'span',
        className: 'error',
        textContent: t('setStylelintError')
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
  setupStylelintSettingsEvents(popup);
}

function loadSelectedLinter(name) {
  let scripts = [];
  if (name !== 'null' && !$('script[src*="css-lint.js"]')) {
    // inject css
    injectCSS('vendor/codemirror/addon/lint/lint.css');
    // load CodeMirror lint code
    scripts.push(
      'vendor/codemirror/addon/lint/lint.js',
      'vendor-overwrites/codemirror/addon/lint/css-lint.js'
    );
  }
  if (name === 'csslint' && !window.CSSLint) {
    scripts.push('vendor/csslint/csslint-worker.js');
  } else if (name === 'stylelint' && !window.stylelint) {
    scripts.push(
      'vendor-overwrites/stylelint/stylelint-bundle.min.js',
      'vendor-overwrites/codemirror/addon/lint/stylelint-config.js'
    );
  }
  return onDOMscripted(scripts);
}
