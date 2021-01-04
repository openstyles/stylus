/* global createWorkerApi */// worker-util.js
'use strict';

(() => {
  const hasCurlyBraceError = warning =>
    warning.text === 'Unnecessary curly bracket (CssSyntaxError)';
  let sugarssFallback;

  /** @namespace EditorWorker */
  createWorkerApi({

    async csslint(code, config) {
      require(['/js/csslint/parserlib', '/js/csslint/csslint']); /* global CSSLint */
      return CSSLint
        .verify(code, config).messages
        .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
    },

    getRules(linter) {
      return ruleRetriever[linter](); // eslint-disable-line no-use-before-define
    },

    metalint(code) {
      require(['/js/meta-parser']); /* global metaParser */
      const result = metaParser.lint(code);
      // extract needed info
      result.errors = result.errors.map(err => ({
        code: err.code,
        args: err.args,
        message: err.message,
        index: err.index,
      }));
      return result;
    },

    async stylelint(opts) {
      require(['/vendor/stylelint-bundle/stylelint-bundle.min']); /* global stylelint */
      try {
        let res;
        let pass = 0;
        /* sugarss is used for stylus-lang by default,
           but it fails on normal css syntax so we retry in css mode. */
        const isSugarSS = opts.syntax === 'sugarss';
        if (sugarssFallback && isSugarSS) opts.syntax = sugarssFallback;
        while (
          ++pass <= 2 &&
          (res = (await stylelint.lint(opts)).results[0]) &&
          isSugarSS && res.warnings.some(hasCurlyBraceError)
        ) sugarssFallback = opts.syntax = 'css';
        delete res._postcssResult; // huge and unused
        return res;
      } catch (e) {
        delete e.postcssNode; // huge, unused, non-transferable
        throw e;
      }
    },
  });

  const ruleRetriever = {

    csslint() {
      require(['/js/csslint/csslint']);
      return CSSLint.getRuleList().map(rule => {
        const output = {};
        for (const [key, value] of Object.entries(rule)) {
          if (typeof value !== 'function') {
            output[key] = value;
          }
        }
        return output;
      });
    },

    stylelint() {
      require(['/vendor/stylelint-bundle/stylelint-bundle.min']);
      const options = {};
      const rxPossible = /\bpossible:("(?:[^"]*?)"|\[(?:[^\]]*?)\]|\{(?:[^}]*?)\})/g;
      const rxString = /"([-\w\s]{3,}?)"/g;
      for (const [id, rule] of Object.entries(stylelint.rules)) {
        const ruleCode = `${rule()}`;
        const sets = [];
        let m, mStr;
        while ((m = rxPossible.exec(ruleCode))) {
          const possible = m[1];
          const set = [];
          while ((mStr = rxString.exec(possible))) {
            const s = mStr[1];
            if (s.includes(' ')) {
              set.push(...s.split(/\s+/));
            } else {
              set.push(s);
            }
          }
          if (possible.includes('ignoreAtRules')) {
            set.push('ignoreAtRules');
          }
          if (possible.includes('ignoreShorthands')) {
            set.push('ignoreShorthands');
          }
          if (set.length) {
            sets.push(set);
          }
        }
        options[id] = sets;
      }
      return options;
    },
  };
})();
