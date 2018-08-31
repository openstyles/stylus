/* global linter editors clipString */
'use strict';

var linterReport = (() => { // eslint-disable-line no-var
  const cms = new Map();
  linter.onChange((annotationsNotSorted, annotations, cm) => {
    if (!cms.has(cm)) {
      cms.set(cm, createTable(cm));
    }
    const table = cms.get(cm);
    table.update();
    table.updateAnnotations(annotations);
  });
  // document.addEventListener('DOMContentLoaded', () => {
    // $('#lint-help').addEventListener('click', showLintHelp);
    // $('#lint').addEventListener('click', gotoLintIssue);
    // $('#linter-settings').addEventListener('click', showLintConfig);
  // }, {once: true});
  return {refresh};

  function refresh() {}

  function createTable(cm) {
    const container = $('.lint-report-container');
    const caption = $create('caption');
    const tbody = $create('tbody');
    const table = $create('table', [caption, tbody]);
    const trs = [];
    container.append(table);
    return {updateAnnotations, update};

    function update() {
      caption.textContent = typeof editor === 'object' ?
        '' : editors.indexOf(cm) + 1;
    }

    function updateAnnotations(lines) {
      let i = 0;
      for (const anno of getAnnotations()) {
        let tr;
        if (trs.length <= i) {
          tr = createTr();
          trs.push(tr);
          tbody.append(tr.element);
        } else {
          tr = trs[i];
        }
        tr.update(anno);
        i++;
      }
      while (trs.length > i) {
        trs.pop().element.remove();
      }
      table.classList.toggle('empty', i > 0);

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
        onclick: () => gotoLintIssue(anno)
      }, [
        severity,
        line,
        $create('td', {attributes: {role: 'sep'}}, ':'),
        col,
        message
      ]);
      return {
        element: trElement,
        update
      };

      function update(_anno) {
        anno = _anno;
        trElement.className = anno.severity;
        severity.dataset.rule = anno.rule;
        severityIcon.className = `CodeMirror-lint-marker-${anno.severity}`;
        severityIcon.textContent = anno.severity;
        line.textContent = anno.from.line + 1;
        col.textContent = anno.from.ch + 1;
        message.title = clipString(anno.message, 1000) + `\n(${anno.rule})`;
        message.textContent = clipString(anno.message, 100);
      }
    }
  }

  function showLintHelp() {}

  function gotoLintIssue() {}

  function showLintConfig() {}
})();
