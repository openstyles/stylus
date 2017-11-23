/* global CodeMirror CSSLint parserlib stylelint linterConfig */
'use strict';

CodeMirror.registerHelper('lint', 'csslint', code => {
  if (!CSSLint.suppressUsoVarError) {
    CSSLint.suppressUsoVarError = true;
    parserlib.css.Tokens[parserlib.css.Tokens.COMMENT].hide = false;
    const isUsoVar = ({value}) => value.startsWith('/*[[') && value.endsWith(']]*/');
    CSSLint.addRule({
      id: 'uso-vars',
      init(parser, reporter) {
        parser.addListener('error', function ({message, line, col}) {
          if (!isUsoVar(this._tokenStream._token)) {
            const {_lt, _ltIndex: i} = this._tokenStream;
            if (i < 2 || !_lt.slice(0, i - 1).reverse().some(isUsoVar)) {
              reporter.error(message, line, col);
            }
          }
        });
      },
    });
  }
  const rules = deepCopy(linterConfig.getCurrent('csslint'));
  Object.defineProperty(rules, 'errors', {get: () => 0, set: () => 0});
  rules['uso-vars'] = 1;
  return CSSLint.verify(code, rules).messages
    .map(({line, col, message, rule, type}) => line && {
      message,
      from: {line: line - 1, ch: col - 1},
      to: {line: line - 1, ch: col},
      rule: rule.id,
      severity: type
    })
    .filter(Boolean);
});

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
