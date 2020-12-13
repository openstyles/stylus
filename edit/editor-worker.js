'use strict';

define(require => { // define and require use `importScripts` which is synchronous

  /** @namespace EditorWorker */
  require('/js/worker-util').createAPI({

    async csslint(code, config) {
      return require('/js/csslint/csslint')
        .verify(code, config).messages
        .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
    },

    getRules(linter) {
      return ruleRetriever[linter](); // eslint-disable-line no-use-before-define
    },

    metalint(code) {
      const result = require('/js/meta-parser').lint(code);
      // extract needed info
      result.errors = result.errors.map(err => ({
        code: err.code,
        args: err.args,
        message: err.message,
        index: err.index,
      }));
      return result;
    },

    async stylelint(code, config) {
      require('/vendor/stylelint-bundle/stylelint-bundle.min');
      const {results: [res]} = await self.require('stylelint').lint({code, config});
      delete res._postcssResult; // huge and unused
      return res;
    },
  });

  const ruleRetriever = {

    csslint() {
      return require('/js/csslint/csslint').getRules().map(rule => {
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
      require('/vendor/stylelint-bundle/stylelint-bundle.min');
      const stylelint = self.require('stylelint');
      const options = {};
      const rxPossible = /\bpossible:("(?:[^"]*?)"|\[(?:[^\]]*?)\]|\{(?:[^}]*?)\})/g;
      const rxString = /"([-\w\s]{3,}?)"/g;
      for (const id of Object.keys(stylelint.rules)) {
        const ruleCode = String(stylelint.rules[id]);
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
        if (sets.length) {
          options[id] = sets;
        }
      }
      return options;
    },
  };
});
