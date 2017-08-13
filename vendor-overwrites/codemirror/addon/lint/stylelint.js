// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// Depends on stylelint.js from https://github.com/...

// declare global: StyleLint

(function(mod) {
  if (typeof exports == 'object' && typeof module == 'object') // CommonJS
    mod(require('../../lib/codemirror'));
  else if (typeof define == 'function' && define.amd) // AMD
    define(['../../lib/codemirror'], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
'use strict';

CodeMirror.registerHelper('lint', 'css', text => {
  let found = [];
  const stylelint = require('stylelint').lint;

  if (!stylelint) {
    return found;
  }

  return stylelint({
      code: text,
      // stylelintConfig stored in stylelint-config.js & loaded by edit.html
      config: stylelintConfig
    }).then(output => {
      const warnings = output.results.length ? output.results[0].warnings : [],
        len = warnings.length;
      let i, warning;
      if (len) {
        for (i = 0; i < len; i++) {
          warning = warnings[i];
          found.push({
            from: CodeMirror.Pos(warning.line - 1, warning.column - 1),
            to: CodeMirror.Pos(warning.line - 1, warning.column),
            message: warning.text,
            severity : warning.severity
          });
        }
      }
      return found;
    });
});

});
