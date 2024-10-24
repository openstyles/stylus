import {$, $create} from '/js/dom';
import {clipString} from '/js/util';
import * as linterMan from '.';
import editor from '../editor';

const tables = new Map();

linterMan.onLintingUpdated((annotationsNotSorted, annotations, cm) => {
  let table = tables.get(cm);
  if (!table) {
    table = createTable(cm);
    tables.set(cm, table);
    const container = $('.lint-report-container');
    const nextSibling = findNextSibling(cm);
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

export function getIssues() {
  const issues = new Set();
  for (const table of tables.values()) {
    for (const tr of table.trs) {
      issues.add(tr.getAnnotation());
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
  $('#lint').hidden = !issueCount;
  $('#issue-count').textContent = issueCount;
}

function findNextSibling(cm) {
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
