/* global require importScripts */
'use strict';

importScripts('/vendor/stylelint-bundle/stylelint-bundle.min.js');

const stylelint = require('stylelint');

self.onmessage = ({data: {action = 'run', code, config}}) => {
  switch (action) {
    case 'getAllRuleIds':
      // the functions are non-tranferable
      self.postMessage(Object.keys(stylelint.rules));
      return;
    case 'getAllRuleOptions':
      self.postMessage(getAllRuleOptions());
      return;
    case 'run':
      stylelint.lint({code, config}).then(results =>
        self.postMessage(results));
      return;
  }
};

function getAllRuleOptions() {
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
}
