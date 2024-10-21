import {COMMANDS} from '/js/port';
import {importScriptsOnce} from './worker-util';

let sugarss = null;

/** @namespace EditorWorker */
Object.assign(COMMANDS, {

  async csslint(code, config) {
    importScriptsOnce('parserlib.js', 'csslint.js'); /* global CSSLint */
    return CSSLint
      .verify(code, config).messages
      .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
  },

  getCssPropsValues() {
    importScriptsOnce('parserlib.js'); /* global parserlib */
    const {
      css: {GlobalKeywords, NamedColors, Parser: {AT}, Properties},
      util: {describeProp},
    } = parserlib;
    const COLOR = '<color>';
    const rxColor = RegExp(`${COLOR}|${describeProp(COLOR).replace(/[()|]/g, '\\$&')}|~~~`, 'g');
    const rxNonWord = /(?:<.+?>|[^-\w<(]+\d*)+/g;
    const res = {};
    // moving vendor-prefixed props to the end
    const cmp = (a, b) => a[0] === '-' && b[0] !== '-' ? 1 : a < b ? -1 : a > b;
    for (const [k, v] of Object.entries(Properties)) {
      if (v !== -1) res[k] = false; // skipping deprecated props
      if (typeof v === 'string') {
        let last = '';
        const uniq = [];
        // strip definitions of function arguments
        const vNoColor = v.replace(rxColor, '~~~');
        const desc = describeProp(vNoColor);
        const descNoColors = desc.replace(rxColor, '');
        // add a prefix to functions to group them at the end
        const words = descNoColors.replace(/([-\w]+\().*?\)/g, 'z-$1').split(rxNonWord).sort(cmp);
        for (let w of words) {
          if (w.startsWith('z-')) w = w.slice(2);
          if (w !== last) uniq.push(last = w);
        }
        if (desc !== descNoColors || v !== vNoColor) uniq.push(COLOR);
        if (uniq.length) res[k] = uniq;
      }
    }
    return {
      all: res,
      ats: [...Object.keys(AT), 'starting-style']
        .map(k => `@${k === 'document' ? '-moz-' : ''}${k}`)
        .sort(),
      colors: NamedColors,
      global: GlobalKeywords,
    };
  },

  getRules(linter) {
    return ruleRetriever[linter](); // eslint-disable-line no-use-before-define
  },

  metalint(code) {
    importScriptsOnce('meta-parser.js'); /* global metaParser */
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
    importScriptsOnce('stylelint.js'); /* global stylelint */
    // Stylus-lang allows a trailing ";" but sugarss doesn't, so we monkeypatch it
    stylelint.SugarSSParser.prototype.checkSemicolon = ovrCheckSemicolon;
    for (const r in opts.config.rules) {
      if (!stylelint.rules[r]) delete opts.config.rules[r];
    }
    for (let pass = 2; --pass >= 0;) {
      /* We try sugarss (for indented stylus-lang), then css mode, switching them on failure,
       * so that the succeeding syntax will be used next time first. */
      if (opts.mode === 'stylus') {
        if (sugarss == null) sugarss = !opts.code.includes('{');
        opts.config.customSyntax = sugarss ? 'sugarss' : '';
      }
      const res = (await stylelint.lint(opts)).results[0];
      const errors = res.parseErrors.concat(res.warnings);
      if (sugarss && pass && errors[0] &&
          errors[0].text === 'Unnecessary curly bracket (CssSyntaxError)') {
        sugarss = !sugarss;
        continue;
      }
      return collectStylelintResults(errors, opts);
    }
  },
});

const ruleRetriever = {

  csslint() {
    importScriptsOnce('csslint.js');
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
    importScriptsOnce('stylelint.js');
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

function collectStylelintResults(messages, {mode}) {
  /* We hide nonfatal "//" warnings since we lint with sugarss without applying @preprocessor.
   * We can't easily pre-remove "//"  comments which may be inside strings, comments, url(), etc.
   * And even if we did, it'd be wrong to hide potential bugs in stylus-lang like #1460 */
  const isLess = mode === 'text/x-less';
  const slashCommentAllowed = isLess || mode === 'stylus';
  const res = [];
  for (const m of messages) {
    const {rule} = m;
    const msg = m.text.replace(/^Unexpected\s+/, '').replace(` (${rule})`, '');
    if (slashCommentAllowed && msg.includes('"//"') ||
        isLess && /^unknown at-rule "@[-\w]+:"/.test(msg) /* LESS variables */) {
      continue;
    }
    const {line: L, column: C} = m;
    res.push({
      from: {line: L - 1, ch: C - 1},
      to: {line: (m.endLine || L) - 1, ch: (m.endColumn || C) - 1},
      message: msg[0].toUpperCase() + msg.slice(1),
      severity: m.severity,
      rule,
    });
  }
  return res;
}

function ovrCheckSemicolon(tt) {
  while (tt.length && tt[tt.length - 1][0] === ';') tt.pop();
}
