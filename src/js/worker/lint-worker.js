import {kAtRuleNoUnknown, kDeclarationPropertyValueNoUnknown} from '@/edit/linter/defaults';
import {kCssPropSuffix} from '@/js/consts';
import {metaLint} from './meta-parser';
import {load, loadParserlib, loadStylusLang, parserlib, stylusLang} from './util';

let CSSLint, stylelint;

const loadCSSLint = () => (parserlib || loadParserlib()) && load('csslint.js', 'CSSLint');
const loadStylelint = () => load('stylelint.js', 'stylelint');
const rxMessageParts = /^[^"]+"(.*)"[^"]+"([^"]+)"$/;
const rxVarsLess = /@[-\w]+/;
const rxVarsLessDecl = /"@[-\w]+:"/;
const rxVarsStylus = /(?:^|[^-$\w])[$\w][-$\w]*(?=[^-$\w]|$)/;

/** @namespace WorkerAPI */
const LintWorkerAPI = {

  csslint(code, config) {
    CSSLint ||= loadCSSLint();
    config.import = 1;
    const results = CSSLint.verify(code, config).messages;
    let len = 0;
    let line, col;
    for (const r of results) {
      if ((line = r.line)) {
        line--;
        col = r.col;
        results[len++] = {
          message: r.message,
          from: {line, ch: col - 1},
          to: {line, ch: col},
          rule: r.rule.id,
          severity: r.type,
        };
      }
    }
    results.length = len;
    return results;
  },

  getCssPropsValues() {
    if (!parserlib) loadParserlib();
    const {
      css: {GlobalKeywords, NamedColors, Parser: {AT}, Properties},
      util: {describeProp, VTFunctions},
    } = parserlib;
    const atKeys = [`@-moz-document`, '@starting-style'];
    const keys = Object.keys(Properties).sort();
    const COLOR = '<color>';
    const rxColor = RegExp(`${COLOR}|${describeProp(COLOR).replace(/[()|]/g, '\\$&')}|~~~`, 'g');
    const rxFunc = /([-\w]+\().*?\)/g;
    const rxNonWord = /(?:<.+?>|[^-\w<(]+\d*)+/g;
    const res = {};
    // moving vendor-prefixed props to the end
    const cmp = (a, b) => a[0] === '-' && b[0] !== '-' ? 1 : a < b ? -1 : a > b;
    for (const k in AT) {
      if (k !== 'document') atKeys.push('@' + k);
    }
    for (let i = 0, k, v; i < keys.length; i++) {
      k = keys[i];
      v = Properties[k];
      if (typeof v === 'string') {
        let last = '';
        const uniq = [];
        // strip definitions of function arguments
        const vNoColor = v.replace(rxColor, '~~~');
        const desc = describeProp(vNoColor);
        const descNoColors = desc.replace(rxColor, '');
        // add a prefix to functions to group them at the end
        const words = descNoColors.replace(rxFunc, 'z-$1').split(rxNonWord).sort(cmp);
        for (let w of words) {
          if (w.startsWith('z-')) w = w.slice(2);
          if (w !== last) uniq.push(last = w);
        }
        if (desc !== descNoColors || v !== vNoColor) uniq.push(COLOR);
        v = uniq.join('\n');
      } else if (v === -1) { // skipping deprecated props
        k = '';
      } else {
        v = '';
      }
      if (k) res[k += kCssPropSuffix] = v;
      keys[i] = k;
    }
    /** @namespace AutocompleteSpec */
    return {
      all: res,
      ats: atKeys.sort(),
      colors: NamedColors.join('\n') + '\n' + Object.keys(VTFunctions.color).join('(\n') + '(',
      global: GlobalKeywords,
      keys: keys.filter(Boolean),
    };
  },

  getRules(linter) {
    return ruleRetriever[linter]();
  },

  metalint(code) {
    const result = metaLint(code);
    // extract needed info
    result.errors = result.errors.map(err => ({
      code: err.code,
      args: err.args,
      message: err.message,
      index: err.index,
    }));
    return result;
  },

  async stylelint(code, config, mode, vars) {
    if (!stylelint) {
      global.stylus = new Proxy({}, {
        get: (_, key) => (stylusLang || loadStylusLang())[key],
      });
      stylelint = loadStylelint();
    }
    for (const r in config.rules)
      if (!stylelint.rules[r]) delete config.rules[r];
    const {results: [res]} = await stylelint.lint({
      code, config,
      customSyntax: stylelint.syntax[mode],
    });
    const messages = res._postcssResult?.messages || res.warnings;
    messages.push(...res.parseErrors);
    collectStylelintResults(messages, code, mode, vars);
    return messages;
  },
};

const ruleRetriever = {

  csslint() {
    CSSLint ||= loadCSSLint();
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
    stylelint ||= loadStylelint();
    const options = {};
    const rxPossible = /\bpossible:("[^"]*?"|\[[^\]]*?]|\{[^}]*?})/g;
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

const collectStylelintResults = (messages, code, mode, vars) => {
  let v, rxVars;
  let len = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const {rule} = m;
    const {start: {offset: a} = {}, end: {offset: b} = {}} = m;
    const msg = m.text.replace(/^Unexpected\s+/, '').replace(` (${rule})`, '');
    if (rule === kAtRuleNoUnknown) {
      if (mode === 'less' && rxVarsLessDecl.test(msg))
        continue;
    } else if (
      rule === kDeclarationPropertyValueNoUnknown &&
      (v = rxMessageParts.exec(msg)) &&
      (v = v[1] || code.slice(v[2].length + (code.lastIndexOf(v[2], a) + 1 || a), b)) &&
      (vars ? rxVars ??= RegExp(vars) : mode === 'less' ? rxVarsLess : rxVarsStylus).test(msg)
    ) continue;
    const {line: L, column: C} = m;
    const isImport = msg.includes('at-rule "@import"');
    /** @namespace LintAnnotation */
    messages[len++] = {
      message: isImport ? '@import prevents parallel downloads and may be blocked by CSP.' : msg,
      from: {line: L - 1, ch: C - 1, offset: a},
      to: {line: (m.endLine || L) - 1, ch: (m.endColumn || C) - 1, offset: b},
      rule: isImport ? '' : rule,
      severity: isImport ? 'warning' : m.severity,
    };
  }
  messages.length = len;
};

export default LintWorkerAPI;
