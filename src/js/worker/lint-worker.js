import {kCssPropSuffix, mimeLESS} from '@/js/consts';
import {metaLint} from './meta-parser';
import {CSSLint, loadCSSLint, loadParserlib, loadStylelint, parserlib, stylelint} from './util';

const sugarss = {};

/** @namespace WorkerAPI */
export default {

  csslint(code, config) {
    if (!CSSLint) loadCSSLint();
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

  async stylelint(code, config, mode, styleId) {
    if (!stylelint) {
      loadStylelint();
      // Stylus-lang allows a trailing ";" but sugarss doesn't, so we monkeypatch it
      stylelint.syntax.sugarss.Parser.prototype.checkSemicolon = ovrCheckSemicolon;
    }
    const isLess = mode === mimeLESS;
    const cfgRules = config.rules;
    const kAtRuleDisallowedList = 'at-rule-disallowed-list';
    let atRules = cfgRules[kAtRuleDisallowedList];
    for (const r in cfgRules)
      if (!stylelint.rules[r]) delete cfgRules[r];
    if (!Array.isArray(atRules))
      atRules = cfgRules[kAtRuleDisallowedList] = [];
    atRules.push('import');
    for (let pass = 2; --pass >= 0;) {
      /* We try sugarss (for indented stylus-lang), then css mode, switching them on failure,
       * so that the succeeding syntax will be used next time first. */
      const res = await stylelint.lint({
        code, config, mode,
        customSyntax:
          mode === 'stylus'
            ? (sugarss[styleId] ??= !code.includes('{')) && stylelint.syntax.sugarss
            : isLess && stylelint.syntax.less,
      });
      const {results: [{parseErrors: errors, _postcssResult: {messages}}]} = res;
      if (sugarss[styleId] && pass && errors[0] &&
          errors[0].text === 'Unnecessary curly bracket (CssSyntaxError)') {
        sugarss[styleId] = !sugarss[styleId];
        continue;
      }
      messages.push(...errors);
      collectStylelintResults(messages, code, mode, isLess);
      return messages;
    }
  },
};

const ruleRetriever = {

  csslint() {
    if (!CSSLint) loadCSSLint();
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
    if (!stylelint) loadStylelint();
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

function collectStylelintResults(messages, code, mode, isLess) {
  /* We hide nonfatal "//" warnings since we lint with sugarss without applying @preprocessor.
   * We can't easily pre-remove "//"  comments which may be inside strings, comments, url(), etc.
   * And even if we did, it'd be wrong to hide potential bugs in stylus-lang like #1460 */
  const slashCommentAllowed = isLess || mode === 'stylus';
  const rxLessVars = isLess && /^Cannot parse property .+@[-\w]/i;
  let len = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const {rule} = m;
    const {start: {offset: ofs1} = {}, end: {offset: ofs2} = {}} = m;
    const msg = m.text.replace(/^Unexpected\s+/, '').replace(` (${rule})`, '');
    if (
      slashCommentAllowed && msg.includes('"//"') ||
      isLess && rxLessVars.test(msg) ||
      (mode === 'css' &&
        rule === 'declaration-property-value-no-unknown' &&
        msg.startsWith('Unknown value')
      ) && (
        msg.includes('/*[[') ||
        code.slice(code.lastIndexOf(msg.split('"').slice(-2, -1)[0], ofs1), ofs2).includes('/*[[')
      )
    ) continue;
    const {line: L, column: C} = m;
    const isImport = msg.includes('at-rule "@import"');
    /** @namespace LintAnnotation */
    messages[len++] = {
      message: isImport ? '@import prevents parallel downloads and may be blocked by CSP.' : msg,
      from: {line: L - 1, ch: C - 1, offset: ofs1},
      to: {line: (m.endLine || L) - 1, ch: (m.endColumn || C) - 1, offset: ofs2},
      rule: isImport ? '' : rule,
      severity: isImport ? 'warning' : m.severity,
    };
  }
  messages.length = len;
}

function ovrCheckSemicolon(tt) {
  while (tt.length && tt[tt.length - 1][0] === ';') tt.pop();
}
