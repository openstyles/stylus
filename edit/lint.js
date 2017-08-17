/* global CodeMirror CSSLint editors makeSectionVisible showHelp stylelintDefaultConfig BG */
'use strict';

function initLint() {
  document.getElementById('lint-help').addEventListener('click', showLintHelp);
  document.getElementById('lint').addEventListener('click', gotoLintIssue);
  window.addEventListener('resize', resizeLintReport);
  document.getElementById('stylelint-settings').addEventListener('click', openStylelintSettings);

  // touch devices don't have onHover events so the element we'll be toggled via clicking (touching)
  if ('ontouchstart' in document.body) {
    document.querySelector('#lint h2').addEventListener('click', toggleLintReport);
  }
  BG.chromeLocal.getValue('editorStylelintRules').then(rules => setStylelintRules(rules));
}

function setStylelintRules(rules = {}) {
  if (Object.keys(rules).length === 0) {
    rules = deepCopy(stylelintDefaultConfig.rules);
  }
  BG.chromeLocal.setValue('editorStylelintRules', rules);
}

function setLinter(name) {
  return {
    getAnnotations: CodeMirror.lint[name],
    delay: prefs.get('editor.lintDelay')
  };
}

function updateLinter(name = 'csslint') {
  if (prefs.get('editor.linter') !== name) {
    prefs.set('editor.linter', name);
  }
  editors.forEach(cm => {
    cm.setOption('lint', setLinter(name));
    updateLintReport(cm, 200);
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
    setTimeout(cm => { cm.performLint(); update(cm); }, delay, cm);
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
            info.message.substring(info.message.lastIndexOf('('), info.message.length) :
            / at line \d.+$/;
          // csslint
          const message = escapeHtml(info.message.replace(rule, ''));
          if (isActiveLine || oldMarkers[pos] === message) {
            delete oldMarkers[pos];
          }
          newMarkers[pos] = message;
          return `<tr class="${info.severity}">
            <td role="severity" class="CodeMirror-lint-marker-${info.severity}"
              ${linter === 'stylelint' ? 'title="Rule: ' + rule + '"' : ''}>
              ${info.severity}
            </td>
            <td role="line">${info.from.line + 1}</td>
            <td role="sep">:</td>
            <td role="col">${info.from.ch + 1}</td>
            <td role="message" title="${message}">${message}</td>
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
  const container = document.getElementById('lint');
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
    document.getElementById('issue-count').textContent = issueCount;
    container.replaceChild(newContent, content);
    container.style.display = newContent.children.length ? 'block' : 'none';
    resizeLintReport();
  }
}

function resizeLintReport() {
  const magicBuffer = 20; // subtracted value to prevent scrollbar
  const content = $('#lint table');
  if (content.children.length) {
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
    line: parseInt(issue.querySelector('td[role="line"]').textContent) - 1,
    ch: parseInt(issue.querySelector('td[role="col"]').textContent) - 1
  });
}

function toggleLintReport() {
  document.getElementById('lint').classList.toggle('collapsed');
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
      const rule = el.title.replace('Rule: (', '').replace(/[()]/g, '').trim();
      if (!rules.includes(rule)) {
        list += `<li><a target="_blank" href="${url}${rule}/">${rule}</a></li>`;
        rules.push(rule);
      }
    });
  }
  return showHelp(t('issues'), header + list + '</ul>');
}

function setupStylelintSettingsEvents() {
  let timer;
  $('#help-popup .save').addEventListener('click', () => {
    try {
      setStylelintRules(JSON.parse($('#help-popup textarea').value).rules);
      // it is possible to have stylelint rules popup open & switch to csslint
      if (prefs.get('editor.linter') === 'stylelint') {
        updateLinter('stylelint');
      }
    } catch (err) {
      $('#help-popup .error').classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => {
        // popup may be closed at this point
        const error = $('#help-popup .error');
        if (error) {
          error.classList.remove('show');
        }
      }, 3000);
    }
    return false;
  });
  $('#help-popup .reset').addEventListener('click', () => {
    setStylelintRules();
    $('#help-popup .settings').value = JSON.stringify({rules: stylelintDefaultConfig.rules}, null, 2);
    if (prefs.get('editor.linter') === 'stylelint') {
      updateLinter('stylelint');
    }
    return false;
  });
}

function openStylelintSettings() {
  BG.chromeLocal.getValue('editorStylelintRules').then((rules = stylelintDefaultConfig.rules) => {
    const link = '<a target="_blank" href="https://stylelint.io/demo/">Stylelint</a>';
    const text = JSON.stringify({rules: rules}, null, 2);
    const content = `<textarea class="contents settings">${text}</textarea>
      <p>${t('setStylelintLink', link)}</p>
      <button class="save" type="button">Save</button>&nbsp;
      <button class="reset" type="button">Reset</button>
      <span class="error">
        ${t('setStylelintError')} (<a target="_blank" href="https://jsonlint.com/">JSONLint</a>)
      </span>`;
    showHelp(t('setStylelintRules'), content);
    setupStylelintSettingsEvents();
  });
}
