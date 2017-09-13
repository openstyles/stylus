/* global CodeMirror CSSLint stylelint linterConfig */
'use strict';

CodeMirror.registerHelper('lint', 'csslint', code =>
  CSSLint.verify(code, deepCopy(linterConfig.getCurrent('csslint')))
    .messages.map(message => ({
      from: CodeMirror.Pos(message.line - 1, message.col - 1),
      to: CodeMirror.Pos(message.line - 1, message.col),
      message: message.message,
      rule: message.rule.id,
      severity : message.type
    }))
);

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
