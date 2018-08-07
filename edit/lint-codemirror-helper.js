/* global CodeMirror linterConfig */
'use strict';

(() => {
  CodeMirror.registerHelper('lint', 'csslint', invokeHelper);
  CodeMirror.registerHelper('lint', 'stylelint', invokeHelper);

  const COOKS = {
    csslint: results =>
      results.map(({line, col: ch, message, rule, type: severity}) => line && {
        message,
        from: {line: line - 1, ch: ch - 1},
        to: {line: line - 1, ch},
        rule: rule.id,
        severity,
      }).filter(Boolean),

    stylelint({results}, cm) {
      if (!results[0]) return [];
      const output = results[0].warnings.map(({line, column: ch, text, severity}) => ({
        from: {line: line - 1, ch: ch - 1},
        to: {line: line - 1, ch},
        message: text
          .replace('Unexpected ', '')
          .replace(/^./, firstLetter => firstLetter.toUpperCase())
          .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
        rule: text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
        severity,
      }));
      return cm.doc.mode.name !== 'stylus' ?
        output :
        output.filter(({message}) =>
          !message.includes('"@css"') || !message.includes('(at-rule-no-unknown)'));
    },
  };

  function invokeHelper(code, options, cm) {
    const config = linterConfig.getCurrent();
    const cook = COOKS[linterConfig.getName()];
    return linterConfig.invokeWorker({code, config})
      .then(data => cook(data, cm));
  }
})();
