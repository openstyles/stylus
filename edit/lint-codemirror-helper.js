/* global CodeMirror CSSLint parserlib stylelint linterConfig */
'use strict';

CodeMirror.registerHelper('lint', 'csslint', code => new Promise(resolve => {
  CSSLint.onmessage = ({data}) => {
    resolve(
      data.map(({line, col, message, rule, type}) => line && {
        message,
        from: {line: line - 1, ch: col - 1},
        to: {line: line - 1, ch: col},
        rule: rule.id,
        severity: type
      }).filter(Boolean));
  };
  const config = deepCopy(linterConfig.getCurrent('csslint'));
  CSSLint.postMessage({action: 'verify', code, config});
}));

CodeMirror.registerHelper('lint', 'stylelint', code =>
  stylelint.lint({
    code,
    config: deepCopy(linterConfig.getCurrent('stylelint')),
  }).then(({results}) => {
    if (!results[0]) {
      return [];
    }
    return results[0].warnings.map(warning => ({
      from: CodeMirror.Pos(warning.line - 1, warning.column - 1),
      to: CodeMirror.Pos(warning.line - 1, warning.column),
      message: warning.text
        .replace('Unexpected ', '')
        .replace(/^./, firstLetter => firstLetter.toUpperCase())
        .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
      rule: warning.text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
      severity : warning.severity
    }));
  })
);
