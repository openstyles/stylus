import parserlib from './parserlib';
import {Reporter} from './rules/-util';
import ruleBoxModel from './rules/box-model';
import ruleCompatibleVendorPrefixes from './rules/compatible-vendor-prefixes';
import ruleDisplayPropertyGrouping from './rules/display-property-grouping';
import ruleDuplicateBackgroundImages from './rules/duplicate-background-images';
import ruleDuplicateProperties from './rules/duplicate-properties';
import ruleEmptyRules from './rules/empty-rules';
import ruleErrors from './rules/errors';
import ruleFloats from './rules/floats';
import ruleFontFaces from './rules/font-faces';
import ruleFontSizes from './rules/font-sizes';
import ruleGlobalsInDocument from './rules/globals-in-document';
import ruleGradients from './rules/gradients';
import ruleIds from './rules/ids';
import ruleImport from './rules/import';
import ruleImportant from './rules/important';
import ruleKnownProperties from './rules/known-properties';
import ruleKnownPseudos from './rules/known-pseudos';
import ruleOrderAlphabetical from './rules/order-alphabetical';
import ruleOutlineNone from './rules/outline-none';
import ruleOverqualifiedElements from './rules/overqualified-elements';
import ruleQualifiedHeadings from './rules/qualified-headings';
import ruleRegexSelectors from './rules/regex-selectors';
import ruleSelectorNewline from './rules/selector-newline';
import ruleShorthand from './rules/shorthand';
import ruleShorthandOverrides from './rules/shorthand-overrides';
import ruleSimpleNot from './rules/simple-not';
import ruleStarPropertyHack from './rules/star-property-hack';
import ruleStyleRuleNesting from './rules/style-rule-nesting';
import ruleTextIndent from './rules/text-indent';
import ruleUnderscorePropertyHack from './rules/underscore-property-hack';
import ruleUniqueHeadings from './rules/unique-headings';
import ruleUniversalSelector from './rules/universal-selector';
import ruleUnqualifiedAttributes from './rules/unqualified-attributes';
import ruleVendorPrefix from './rules/vendor-prefix';
import ruleWarnings from './rules/warnings';
import ruleZeroUnits from './rules/zero-units';

// previous CSSLint overrides are used to decide whether the parserlib's cache should be reset
let prevOverrides;

const rxEmbedded = /\/\*\s*csslint\s+((?:[^*]+|\*(?!\/))+?)\*\//ig;
const rxGrammarAbbr = /([-<])(int|len|num|pct|rel-(\w{3}))(?=\W)/g;
const ABBR_MAP = {
  int: 'integer',
  len: 'length',
  num: 'number',
  pct: 'percentage',
  'rel-hsl': 'h-s-l-alpha-none',
  'rel-hwb': 'h-w-b-alpha-none',
  'rel-lab': 'l-a-b-alpha-none',
  'rel-lch': 'l-c-h-alpha-none',
  'rel-rgb': 'r-g-b-alpha-none',
};
const unabbreviate = (_, c, str) => c + (ABBR_MAP[str]) || str;
const EBMEDDED_RULE_VALUE_MAP = {
  // error
  'true': 2,
  '2': 2,
  // warning
  '': 1,
  '1': 1,
  // ignore
  'false': 0,
  '0': 0,
};
const rules = {
  __proto__: null,
  'box-model': ruleBoxModel,
  'compatible-vendor-prefixes': ruleCompatibleVendorPrefixes,
  'display-property-grouping': ruleDisplayPropertyGrouping,
  'duplicate-background-images': ruleDuplicateBackgroundImages,
  'duplicate-properties': ruleDuplicateProperties,
  'empty-rules': ruleEmptyRules,
  'errors': ruleErrors,
  'floats': ruleFloats,
  'font-faces': ruleFontFaces,
  'font-sizes': ruleFontSizes,
  'globals-in-document': ruleGlobalsInDocument,
  'gradients': ruleGradients,
  'ids': ruleIds,
  'import': ruleImport,
  'important': ruleImportant,
  'known-properties': ruleKnownProperties,
  'known-pseudos': ruleKnownPseudos,
  'order-alphabetical': ruleOrderAlphabetical,
  'outline-none': ruleOutlineNone,
  'overqualified-elements': ruleOverqualifiedElements,
  'qualified-headings': ruleQualifiedHeadings,
  'regex-selectors': ruleRegexSelectors,
  'selector-newline': ruleSelectorNewline,
  'shorthand': ruleShorthand,
  'shorthand-overrides': ruleShorthandOverrides,
  'simple-not': ruleSimpleNot,
  'star-property-hack': ruleStarPropertyHack,
  'style-rule-nesting': ruleStyleRuleNesting,
  'text-indent': ruleTextIndent,
  'underscore-property-hack': ruleUnderscorePropertyHack,
  'unique-headings': ruleUniqueHeadings,
  'universal-selector': ruleUniversalSelector,
  'unqualified-attributes': ruleUnqualifiedAttributes,
  'vendor-prefix': ruleVendorPrefix,
  'warnings': ruleWarnings,
  'zero-units': ruleZeroUnits,
};

const CSSLint = Object.assign(new parserlib.util.EventDispatcher(), {

  rules,

  getRuleList() {
    return Object.values(rules)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id);
  },

  getRuleSet() {
    const ruleset = {};
    // by default, everything is a warning
    for (const id in rules) ruleset[id] = 1;
    return ruleset;
  },

  /**
   * Starts the verification process for the given CSS text.
   * @param {String} text The CSS text to verify.
   * @param {Object} [ruleset] List of rules to apply. If null, then
   *      all rules are used. If a rule has a value of 1 then it's a warning,
   *      a value of 2 means it's an error.
   * @return {Object} Results of the verification.
   */
  verify(text, ruleset = this.getRuleSet()) {
    const allow = {};
    const ignore = [];
    const emi = rxEmbedded.lastIndex =
      text.lastIndexOf('/*',
        text.indexOf('csslint',
          text.indexOf('/*') + 1 || text.length) + 1);
    if (emi >= 0) {
      ruleset = Object.assign({}, ruleset);
      applyEmbeddedOverrides(text, ruleset, allow, ignore);
    }
    const parser = new parserlib.css.Parser({
      starHack: true,
      ieFilters: true,
      underscoreHack: true,
      strict: false,
    });
    const reporter = new Reporter([], ruleset, allow, ignore);
    const {messages} = reporter;
    const report = {messages};
    // TODO: when ruleset is unchanged we can try to invalidate only line ranges in 'allow' and 'ignore'
    const newOvr = [ruleset, allow, ignore];
    const reuseCache = !prevOverrides || JSON.stringify(prevOverrides) === JSON.stringify(newOvr);
    prevOverrides = newOvr;
    // always report parsing errors as errors
    ruleset.errors = 2;
    for (const [id, mode] of Object.entries(ruleset)) {
      const rule = mode && rules[id];
      if (rule) rule.init(rule, parser, reporter);
    }
    try {
      if (ruleset.doc) parser._stack.push(true);
      parser.parse(text, {reuseCache});
    } catch (ex) {
      reporter.error('Fatal error, cannot continue!\n' + ex.stack, ex, {});
    }
    // sort by line numbers, rollups at the bottom
    messages.sort((a, b) => !!a.rollup - !!b.rollup || a.line - b.line || a.col - b.col);
    for (const msg of messages) {
      if ((rxGrammarAbbr.lastIndex = msg.message.indexOf('<')) >= 0) {
        msg.message = msg.message.replace(rxGrammarAbbr, unabbreviate);
      }
    }
    parserlib.util.cache.feedback(report);
    return report;
  },
});

// Example 1:

    /* csslint ignore:start */
    /*
    the chunk of code where errors won't be reported
    the chunk's start is hardwired to the line of the opening comment
    the chunk's end is hardwired to the line of the closing comment
    */
    /* csslint ignore:end */

// Example 2:
// allow rule violations on the current line:

    // foo: bar; /* csslint allow:rulename1,rulename2,... */
    /* csslint allow:rulename1,rulename2,... */ // foo: bar;

// Example 3:

    /* csslint rulename1 */
    /* csslint rulename2:N */
    /* csslint rulename3:N, rulename4:N */

/* entire code is affected;
 * comments futher down the code extend/override previous comments of this kind
 * values for N (without the backquotes):
   `2` or `true` means "error"
   `1` or omitted means "warning" (when omitting, the colon can be omitted too)
   `0` or `false` means "ignore"
*/

function applyEmbeddedOverrides(text, ruleset, allow, ignore) {
  let ignoreStart = null;
  let ignoreEnd = null;
  let lineno = 0;
  let eol = -1;
  let m;

  while ((m = rxEmbedded.exec(text))) {
    // account for the lines between the previous and current match
    while (eol <= m.index) {
      eol = text.indexOf('\n', eol + 1);
      if (eol < 0) eol = text.length;
      lineno++;
    }

    const ovr = m[1].toLowerCase();
    const cmd = ovr.split(':', 1)[0];
    const i = cmd.length + 1;

    switch (cmd.trim()) {

      case 'allow': {
        const allowRuleset = {};
        let num = 0;
        ovr.slice(i).split(',').forEach(allowRule => {
          allowRuleset[allowRule.trim()] = true;
          num++;
        });
        if (num) allow[lineno] = allowRuleset;
        break;
      }

      case 'ignore':
        if (ovr.includes('start')) {
          ignoreStart = ignoreStart || lineno;
          break;
        }
        if (ovr.includes('end')) {
          ignoreEnd = lineno;
          if (ignoreStart && ignoreEnd) {
            ignore.push([ignoreStart, ignoreEnd]);
            ignoreStart = ignoreEnd = null;
          }
        }
        break;

      default:
        ovr.slice(i).split(',').forEach(rule => {
          const pair = rule.split(':');
          const property = pair[0] || '';
          const value = pair[1] || '';
          const mapped = EBMEDDED_RULE_VALUE_MAP[value.trim()];
          ruleset[property.trim()] = mapped === undefined ? 1 : mapped;
        });
    }
  }

  // Close remaining ignore block, if any
  if (ignoreStart) {
    ignore.push([ignoreStart, lineno]);
  }
}

for (const id in rules) {
  const [rule, init] = rules[id];
  rules[id] = rule;
  rule.id = id;
  rule.init = init;
  if (rule.url && !rule.url.includes(':')) {
    rule.url = 'https://github.com/CSSLint/csslint/wiki/' + rule.url;
  }
}

export default CSSLint;
