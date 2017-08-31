/* global CodeMirror CSSLint stylelint linterConfig */
'use strict';

(() => {
  let config;
  const cmpPos = CodeMirror.cmpPos;

  CodeMirror.registerHelper('lint', 'csslint', (code, options, cm) =>
    copyOldIssues(cm, lintChangedRanges(cm, csslintOnRange))
  );

  CodeMirror.registerHelper('lint', 'stylelint', (code, options, cm) =>
    Promise.all(lintChangedRanges(cm, stylelintOnRange))
      .then(results => copyOldIssues(cm, results))
  );

  function csslintOnRange(range) {
    return CSSLint.verify(range.code, config).messages
      .map(item =>
        cookResult(
          range,
          item.line,
          item.col,
          item.message.replace(/ at line \d+, col \d+/, '') + ` (${item.rule.id})`,
          item.type
        )
      );
  }

  function stylelintOnRange(range) {
    return stylelint.lint({code: range.code, config})
      .then(({results}) => ((results[0] || {}).warnings || [])
        .map(item =>
          cookResult(
            range,
            item.line,
            item.column,
            item.text
              .replace('Unexpected ', '')
              .replace(/^./, firstLetter => firstLetter.toUpperCase()),
            item.severity
          )
        )
      );
  }

  function cookResult(range, line, col, message, severity) {
    line--;
    col--;
    const realL = line + range.from.line;
    const realC = col + (line === 0 ? range.from.ch : 0);
    return {
      from: CodeMirror.Pos(realL, realC),
      to: CodeMirror.Pos(realL, realC + 1),
      message,
      severity,
    };
  }

  function lintChangedRanges(cm, lintFunction) {
    const EOF = CodeMirror.Pos(cm.doc.size - 1, cm.getLine(cm.doc.size - 1).length);
    // cache the config for subsequent *lintOnRange
    config = deepCopy(linterConfig.getCurrent());
    let ranges;
    if (
      !cm.stylusChanges ||
      !cm.stylusChanges.length ||
      cm.stylusChanges.some(change => change.origin === 'setValue')
    ) {
      // first run: lint everything
      cm.state.lint.marked = [];
      // the temp monkeypatch in updateLintReport() is there
      // only to allow sep=false that returns a line array
      ranges = [{
        code: cm.getValue(false).join('\n'),
        from: {line: 0, ch: 0},
        to: EOF,
      }];
    } else {
      // sort by 'from' position in ascending order
      const changes = cm.stylusChanges.sort((a, b) => cmpPos(a.from, b.from));
      // extend ranges with pasted text
      for (const change of changes) {
        const addedLines = Math.max(0, change.text.length - 1);
        const removedLines = Math.max(0, change.removed.length - 1);
        const delta = addedLines - removedLines;
        change.to = CodeMirror.Pos(
          Math.max(0, change.to.line + delta),
          Math.max(0, change.to.ch + change.text.last.length - change.removed.last.length + 1)
        );
      }
      // merge pass 1
      ranges = mergeRanges(changes);
      // extend up to previous } and down to next }
      for (const range of ranges) {
        range.from = findBlockEndBefore(range.from, 2);
        range.to = findBlockEndAfter(range.from, 4);
      }
      // merge pass 2 on the extended ranges
      ranges = mergeRanges(ranges);
    }
    // fill the code and run lintFunction
    const results = [];
    for (const range of ranges) {
      range.code = cm.getRange(range.from, range.to);
      results.push(lintFunction(range));
    }
    // reset the changes queue and pass the ranges to updateLintReport
    (cm.stylusChanges || []).length = 0;
    cm.state.lint.changedRanges = ranges;
    return results;

    function findBlockEndBefore(pos, repetitions = 1) {
      const PREV_CMT_END = find('*/', pos, -1);
      const PREV_CMT_START = (prev => cmp(prev, pos) < 0 && prev)(find('/*', PREV_CMT_END, +1));
      const NEXT_CMT_END = PREV_CMT_START && (find('*/', PREV_CMT_START, +1) || EOF);
      const cursor = cm.getSearchCursor(/\/\*|\*\/|[{}]/, pos, {caseFold: false});
      let cmtStart = PREV_CMT_START;
      let cmtEnd = cmtStart && cmp(NEXT_CMT_END, pos) > 0 && NEXT_CMT_END;
      let blockStart;
      let blockEnd;
      while (cursor.findPrevious()) {
        switch (cursor.pos.match[0]) {
          case '{':
            if (!cmtStart || cmp(cmtStart, cursor.pos.to) > 0) {
              blockStart = cursor.pos.from;
            }
            break;
          case '}':
            if (!cmtStart || cmp(cmtStart, cursor.pos.to) > 0) {
              blockEnd = cursor.pos.to;
              if (--repetitions <= 0 || !blockStart) {
                return blockEnd;
              }
              blockStart = null;
            }
            break;
          case '/*':
            cmtStart = cursor.pos.to;
            if (cmp(cmtEnd, blockEnd) > 0) {
              blockEnd = null;
            }
            if (cmp(cmtEnd, blockStart) > 0) {
              blockStart = null;
            }
            break;
          case '*/':
            cmtEnd = cursor.pos.to;
            if (blockEnd && --repetitions <= 0) {
              return blockEnd;
            }
            break;
        }
      }
      return blockEnd || {line: 0, ch: 0};
    }

    function findBlockEndAfter(pos, repetitions = 1) {
      const PREV_CMT_END = find('*/', pos, -1);
      const PREV_CMT_START = (prev => cmp(prev, pos) < 0 && prev)(find('/*', PREV_CMT_END, +1));
      const cursor = cm.getSearchCursor(/\/\*|\*\/|[{}]/, pos, {caseFold: false});
      let cmtStart = PREV_CMT_START;
      let depth = 0;
      while (cursor.findNext()) {
        switch (cursor.pos.match[0]) {
          case '{':
            if (!cmtStart) {
              depth++;
            }
            break;
          case '}':
            if (!cmtStart && (--depth <= 0 && --repetitions <= 0)) {
              return depth < 0 ? cursor.pos.from : cursor.pos.to;
            }
            break;
          case '/*':
            cmtStart = cmtStart || cursor.pos.from;
            break;
          case '*/':
            cmtStart = null;
            break;
        }
      }
      return EOF;
    }

    function find(query, pos, direction) {
      const cursor = cm.getSearchCursor(query, pos, {caseFold: false});
      return direction > 0
        ? cursor.findNext() && cursor.from()
        : cursor.findPrevious() && cursor.to();
    }

    function cmp(a, b) {
      if (!a && !b) {
        return 0;
      }
      if (!a) {
        return -1;
      }
      if (!b) {
        return 1;
      }
      return cmpPos(a, b);
    }
  }

  function mergeRanges(sorted) {
    const ranges = [];
    let lastChange = {from: {}, to: {line: -1, ch: -1}};
    for (const change of sorted) {
      if (cmpPos(change.from, change.to) > 0) {
        // straighten the inverted range
        const from = change.from;
        change.from = change.to;
        change.to = from;
      }
      if (cmpPos(change.from, lastChange.to) > 0) {
        ranges.push({
          from: change.from,
          to: change.to,
          code: '',
        });
      } else if (cmpPos(change.to, lastChange.to) > 0) {
        ranges[ranges.length - 1].to = change.to;
      }
      lastChange = change;
    }
    return ranges;
  }

  function copyOldIssues(cm, newAnns) {
    const EOF = CodeMirror.Pos(cm.doc.size - 1, cm.getLine(cm.doc.size - 1).length);

    const oldMarkers = cm.state.lint.marked;
    let oldIndex = 0;
    let oldAnn = (oldMarkers[0] || {}).__annotation;

    const newRanges = cm.state.lint.changedRanges || [];
    let newIndex = 0;
    let newRange = newRanges[0];

    const finalAnns = [];
    const unique = new Set();
    const pushUnique = item => {
      const key = item.from.line + ' ' + item.from.ch + ' ' + item.message;
      if (!unique.has(key)) {
        unique.add(key);
        finalAnns.push(item);
      }
    };

    const t0 = performance.now();
    while (oldAnn && cmpPos(oldAnn.from, EOF) < 0 || newRange) {
      if (performance.now() - t0 > 500) {
        console.error('infinite loop canceled',
          JSON.stringify([
            newAnns,
            oldMarkers[0] && oldMarkers.map(m => ({from: m.__annotation.from, to: m.__annotation.to})),
            newRanges.map(r => Object.assign(r, {code: undefined}))
          ])
        );
        break;
      }
      // copy old issues prior to current newRange
      // eslint-disable-next-line no-unmodified-loop-condition
      while (oldAnn && (!newRange || cmpPos(oldAnn.to, newRange.from) < 0)) {
        pushUnique(oldAnn);
        oldIndex++;
        oldAnn = (oldMarkers[oldIndex] || {}).__annotation;
      }
      // skip all old issues within newRange
      if (newRange) {
        while (oldAnn && cmpPos(oldAnn.to, newRange.to) <= 0) {
          oldAnn = (oldMarkers[oldIndex++] || {}).__annotation;
        }
      }
      // copy all newRange prior to current oldAnn
      // eslint-disable-next-line no-unmodified-loop-condition
      while (newRange && (!oldAnn || cmpPos(newRange.to, oldAnn.from) <= 0)) {
        newAnns[newIndex].forEach(pushUnique);
        newIndex++;
        newRange = newRanges[newIndex];
      }
    }
    return finalAnns;
  }
})();
