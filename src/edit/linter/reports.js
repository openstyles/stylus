import {template} from '@/js/localization';
import {clipString} from '@/js/util';
import editor from '../editor';
import {lintingUpdatedListeners, unhookListeners} from './store';

const tables = new Map();
let tplReport, tplRow, rowSeverityIcon, rowSeverity, rowLine, rowCol, rowMessage;

lintingUpdatedListeners.add((annotationsNotSorted, annotations, cm) => {
  let table = tables.get(cm);
  if (!table) {
    table = createTable(cm);
    tables.set(cm, table);
    const container = $('.lint-report-container');
    const nextSibling = container.firstChild && !editor.isUsercss ? findNextSibling(cm) : null;
    container.insertBefore(table.element, nextSibling && tables.get(nextSibling).element);
  }
  table.updateCaption();
  table.updateAnnotations(annotations);
  updateCount();
});

unhookListeners.add(cm => {
  const table = tables.get(cm);
  if (table) {
    table.element.remove();
    tables.delete(cm);
  }
  updateCount();
});

export function getIssues() {
  const issues = new Set();
  for (const table of tables.values()) {
    for (const tr of table.trs) {
      issues.add(tr._anno);
    }
  }
  return issues;
}

export function refreshReport() {
  for (const table of tables.values()) {
    table.updateCaption();
  }
}

function updateCount() {
  const issueCount = Array.from(tables.values())
    .reduce((sum, table) => sum + table.trs.length, 0);
  $id('lint').hidden = !issueCount;
  $id('issue-count').textContent = issueCount;
}

function findNextSibling(cm) {
  for (let secs = editor.sections, i = secs.indexOf(cm.editorSection) + 1, v; i < secs.length; i++)
    if (!(v = secs[i]).init && tables.has(v = v.cm))
      return v;
}

function createTable(cm) {
  if (!tplReport) {
    tplReport = template.linterReport;
    tplRow = tplReport.$('tr');
    tplRow.remove();
  }
  const report = tplReport.cloneNode(true);
  const caption = report.$('.caption');
  const table = report.$('table');
  const trs = [];
  table._cm = cm;
  table.onclick = gotoLintIssue;
  return {
    element: report,
    trs,
    updateAnnotations,
    updateCaption,
  };

  function updateCaption() {
    const t = editor.getEditorTitle(cm);
    if (typeof t == 'string') caption.textContent = t;
    else Object.assign(caption, t);
  }

  function updateAnnotations(lines) {
    let i = 0;
    for (const anno of getAnnotations()) {
      const tr = createTr(anno);
      if (i < trs.length) {
        trs[i].replaceWith(trs[i] = tr);
      } else {
        trs.push(tr);
        table.appendChild(tr);
      }
      i++;
    }
    if (!i) {
      trs.length = 0;
      table.textContent = '';
    } else {
      while (trs.length > i) trs.pop().remove();
    }
    report.classList.toggle('empty', !i);

    function *getAnnotations() {
      for (const line of lines) {
        if (line) yield *line;
      }
    }
  }

  function createTr(anno) {
    if (!rowCol) {
      [rowSeverity, rowLine, /*sep*/, rowCol, rowMessage] = tplRow.children;
      rowSeverityIcon = rowSeverity.firstChild;
    }
    const {message, from, rule, severity} = anno;
    rowSeverity.dataset.rule = rule;
    rowSeverityIcon.className = 'CodeMirror-lint-marker CodeMirror-lint-marker-' + severity;
    rowSeverityIcon.textContent = severity;
    rowLine.textContent = from.line + 1;
    rowCol.textContent = from.ch + 1;
    rowMessage.title = clipString(message, 1000) + (rule ? `\n(${rule})` : '');
    rowMessage.textContent = clipString(message, 100).replace(/ at line.*/, '');
    const tr = tplRow.cloneNode(true);
    tr.className = severity;
    tr._anno = anno;
    return tr;
  }
}

function gotoLintIssue(e) {
  const tr = e.target.closest('tr');
  const cm = this._cm;
  editor.scrollToEditor(cm);
  cm.focus();
  cm.jumpToPos(tr._anno.from);
}
