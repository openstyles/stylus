/* global CodeMirror linterConfig */
'use strict';

(() => {
  CodeMirror.registerHelper('lint', 'csslint', invokeHelper);
  CodeMirror.registerHelper('lint', 'stylelint', invokeHelper);

  const cookResults = {
    csslint: results =>
      results.map(({line, col: ch, message, rule, type: severity}) => line && {
        message,
        from: {line: line - 1, ch: ch - 1},
        to: {line: line - 1, ch},
        rule: rule.id,
        severity,
      }).filter(Boolean),

    stylelint: ({results}) =>
      !results[0] && [] ||
      results[0].warnings.map(({line, column: ch, text, severity}) => ({
        from: {line: line - 1, ch: ch - 1},
        to: {line: line - 1, ch},
        message: text
          .replace('Unexpected ', '')
          .replace(/^./, firstLetter => firstLetter.toUpperCase())
          .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
        rule: text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
        severity,
      })),
  };

  function invokeHelper(code) {
    const config = linterConfig.getCurrent();
    return linterConfig.invokeWorker({code, config})
      .then(cookResults[linterConfig.getName()]);
  }
})();
