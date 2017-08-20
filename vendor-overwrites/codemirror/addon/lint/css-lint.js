// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// Depends on csslint.js from https://github.com/stubbornella/csslint

// declare global: CSSLint

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
"use strict";

CodeMirror.registerHelper("lint", "csslint", function(text) {
  let found = [];
  if (window.CSSLint) {

    /* STYLISH: hack start (part 1) */
    var rules = CSSLint.getRules();
    var allowedRules = ["display-property-grouping", "duplicate-properties", "empty-rules", "errors", "known-properties"];
    CSSLint.clearRules();
    rules.forEach(function(rule) {
      if (allowedRules.indexOf(rule.id) >= 0) {
        CSSLint.addRule(rule);
      }
    });
    /* STYLISH: hack end */

    var results = CSSLint.verify(text), messages = results.messages, message = null;
    for ( var i = 0; i < messages.length; i++) {
      message = messages[i];

      /* STYLISH: hack start (part 2) */
      if (message.type === 'warning') {
         // @font-face {font-family: 'Ampersand'; unicode-range: U+26;}
        if (message.message.indexOf('unicode-range') !== -1) {
          continue;
        }
        else if ( // color: hsl(210, 100%, 2.2%); or color: hsla(210, 100%, 2.2%, 0.3);
          message.message.startsWith('Expected (<color>) but found \'hsl') &&
          /hsla?\(\s*(-?\d+)%?\s*,\s*(-?\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%(\s*,\s*(-?\d+|-?\d*.\d+))?\s*\)/.test(message.message)
        ) {
          continue;
        }
        //
      }
      /* STYLISH: hack end */

      var startLine = message.line -1, endLine = message.line -1, startCol = message.col -1, endCol = message.col;
      found.push({
        from: CodeMirror.Pos(startLine, startCol),
        to: CodeMirror.Pos(endLine, endCol),
        message: message.message,
        severity : message.type
      });
    }
  }
  return found;
});

CodeMirror.registerHelper("lint", "stylelint", function(text) {
  let found = [];
  window.stylelint = require('stylelint').lint;
  if (window.stylelint) {
    return BG.chromeLocal.getValue('editorStylelintRules').then((rules = stylelintDefaultConfig.rules) => {
      // stylelintDefaultConfig stored in stylelint-config.js & loaded by edit.html
      if (Object.keys(rules).length === 0) {
        rules = stylelintDefaultConfig.rules;
      }
      return stylelint({
        code: text,
        config: {
          syntax: stylelintDefaultConfig.syntax,
          rules: rules
        }
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
  }
  return found;
});

});
