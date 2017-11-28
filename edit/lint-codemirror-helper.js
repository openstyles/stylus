/* global CodeMirror linterConfig */
'use strict';

CodeMirror.registerHelper('lint', 'csslint', code =>
  linterConfig.invokeWorker({code, config: linterConfig.getCurrent()}).then(results =>
    results.map(({line, col: ch, message, rule, type: severity}) => line && {
      message,
      from: {line: line - 1, ch: ch - 1},
      to: {line: line - 1, ch},
      rule: rule.id,
      severity,
    }).filter(Boolean)));

CodeMirror.registerHelper('lint', 'stylelint', code =>
  linterConfig.invokeWorker({code, config: linterConfig.getCurrent()}).then(({results}) =>
    !results[0] && [] ||
    results[0].warnings.map(({line, column:ch, text, severity}) => ({
      from: {line: line - 1, ch: ch - 1},
      to: {line: line - 1, ch},
      message: text
        .replace('Unexpected ', '')
        .replace(/^./, firstLetter => firstLetter.toUpperCase())
        .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
      rule: text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
      severity,
    }))));
