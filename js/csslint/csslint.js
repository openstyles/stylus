/*
Modded by tophf <github.com/tophf>
========== Original disclaimer:

Copyright (c) 2016 Nicole Sullivan and Nicholas C. Zakas. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the 'Software'), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/* global parserlib */
'use strict';

//#region Reporter

class Reporter {
  /**
   * An instance of Report is used to report results of the
   * verification back to the main API.
   * @class Reporter
   * @constructor
   * @param {String[]} lines - The text lines of the source.
   * @param {Object} ruleset - The set of rules to work with, including if
   *      they are errors or warnings.
   * @param {Object} allow - explicitly allowed lines
   * @param {[][]} ignore - list of line ranges to be ignored
   */
  constructor(lines, ruleset, allow, ignore) {
    this.messages = [];
    this.stats = [];
    this.lines = lines;
    this.ruleset = ruleset;
    this.allow = allow || {};
    this.ignore = ignore || [];
  }

  error(message, {line = 1, col = 1}, rule = {}) {
    this.messages.push({
      type: 'error',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  report(message, {line = 1, col = 1}, rule) {
    if (line in this.allow && rule.id in this.allow[line] ||
        this.ignore.some(range => range[0] <= line && line <= range[1])) {
      return;
    }
    this.messages.push({
      type: this.ruleset[rule.id] === 2 ? 'error' : 'warning',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  info(message, {line = 1, col = 1}, rule) {
    this.messages.push({
      type: 'info',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  rollupError(message, rule) {
    this.messages.push({
      type: 'error',
      rollup: true,
      message,
      rule,
    });
  }

  rollupWarn(message, rule) {
    this.messages.push({
      type: 'warning',
      rollup: true,
      message,
      rule,
    });
  }

  stat(name, value) {
    this.stats[name] = value;
  }
}

//#endregion
//#region CSSLint

//eslint-disable-next-line no-var
var CSSLint = (() => {

  const RX_EMBEDDED = /\/\*\s*csslint\s+((?:[^*]|\*(?!\/))+?)\*\//ig;
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
  const rules = Object.create(null);

  // previous CSSLint overrides are used to decide whether the parserlib's cache should be reset
  let prevOverrides;

  return Object.assign(new parserlib.util.EventTarget(), {
    /**
     * This Proxy allows for direct property assignment of individual rules
     * so that "Go to symbol" command can be used in IDE to find a rule by id
     * as well as reduce the indentation thanks to the use of array literals.
     */
    addRule: new Proxy(rules, {
      set(_, id, [rule, init]) {
        rules[id] = rule;
        rule.id = id;
        rule.init = init;
        return true;
      },
    }),

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
     * @param {Object} ruleset (Optional) List of rules to apply. If null, then
     *      all rules are used. If a rule has a value of 1 then it's a warning,
     *      a value of 2 means it's an error.
     * @return {Object} Results of the verification.
     */
    verify(text, ruleset) {

      if (!ruleset) ruleset = this.getRuleSet();

      const allow = {};
      const ignore = [];
      RX_EMBEDDED.lastIndex =
        text.lastIndexOf('/*',
          text.indexOf('csslint',
            text.indexOf('/*') + 1 || text.length) + 1);
      if (RX_EMBEDDED.lastIndex >= 0) {
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

      // always report parsing errors as errors
      ruleset.errors = 2;
      for (const [id, mode] of Object.entries(ruleset)) {
        const rule = mode && rules[id];
        if (rule) rule.init(rule, parser, reporter);
      }

      // TODO: when ruleset is unchanged we can try to invalidate only line ranges in 'allow' and 'ignore'
      const newOvr = [ruleset, allow, ignore];
      const reuseCache = !prevOverrides || JSON.stringify(prevOverrides) === JSON.stringify(newOvr);
      prevOverrides = newOvr;

      try {
        parser.parse(text, {reuseCache});
      } catch (ex) {
        reporter.error('Fatal error, cannot continue!\n' + ex.stack, ex, {});
      }

      const report = {
        messages: reporter.messages,
        stats: reporter.stats,
        ruleset: reporter.ruleset,
        allow: reporter.allow,
        ignore: reporter.ignore,
      };

      // sort by line numbers, rollups at the bottom
      report.messages.sort((a, b) =>
        a.rollup && !b.rollup ? 1 :
        !a.rollup && b.rollup ? -1 :
        a.line - b.line);

      parserlib.cache.feedback(report);

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

    while ((m = RX_EMBEDDED.exec(text))) {
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
})();

//#endregion
//#region Util

CSSLint.Util = {

  /** Gets the lower-cased text without vendor prefix */
  getPropName(prop) {
    return prop._propName ||
      (prop._propName = prop.text.replace(parserlib.util.rxVendorPrefix, '').toLowerCase());
  },

  registerRuleEvents(parser, {start, property, end}) {
    for (const e of [
      'fontface',
      'keyframerule',
      'page',
      'pagemargin',
      'rule',
      'viewport',
    ]) {
      if (start) parser.addListener('start' + e, start);
      if (end) parser.addListener('end' + e, end);
    }
    if (property) parser.addListener('property', property);
  },

  registerShorthandEvents(parser, {property, end}) {
    const {shorthands, shorthandsFor} = CSSLint.Util;
    let props, inRule;
    CSSLint.Util.registerRuleEvents(parser, {
      start() {
        inRule = true;
        props = null;
      },
      property(event) {
        if (!inRule) return;
        const name = CSSLint.Util.getPropName(event.property);
        const sh = shorthandsFor[name];
        if (sh) {
          if (!props) props = {};
          (props[sh] || (props[sh] = {}))[name] = event;
        } else if (property && props && name in shorthands) {
          property(event, props, name);
        }
      },
      end(event) {
        inRule = false;
        if (end && props) {
          end(event, props);
        }
      },
    });
  },

  get shorthands() {
    const WSC = 'width|style|color';
    const TBLR = 'top|bottom|left|right';
    const shorthands = Object.create(null);
    const shorthandsFor = Object.create(null);
    for (const [sh, pattern, ...args] of [
      ['animation', '%-1',
        'name|duration|timing-function|delay|iteration-count|direction|fill-mode|play-state'],
      ['background', '%-1', 'image|size|position|repeat|origin|clip|attachment|color'],
      ['border', '%-1-2', TBLR, WSC],
      ['border-top', '%-1', WSC],
      ['border-left', '%-1', WSC],
      ['border-right', '%-1', WSC],
      ['border-bottom', '%-1', WSC],
      ['border-block-end', '%-1', WSC],
      ['border-block-start', '%-1', WSC],
      ['border-image', '%-1', 'source|slice|width|outset|repeat'],
      ['border-inline-end', '%-1', WSC],
      ['border-inline-start', '%-1', WSC],
      ['border-radius', 'border-1-2-radius', 'top|bottom', 'left|right'],
      ['border-color', 'border-1-color', TBLR],
      ['border-style', 'border-1-style', TBLR],
      ['border-width', 'border-1-width', TBLR],
      ['column-rule', '%-1', WSC],
      ['columns', 'column-1', 'width|count'],
      ['flex', '%-1', 'grow|shrink|basis'],
      ['flex-flow', 'flex-1', 'direction|wrap'],
      ['font', '%-style|%-variant|%-weight|%-stretch|%-size|%-family|line-height'],
      ['grid', '%-1',
        'template-rows|template-columns|template-areas|' +
        'auto-rows|auto-columns|auto-flow|column-gap|row-gap'],
      ['grid-area', 'grid-1-2', 'row|column', 'start|end'],
      ['grid-column', '%-1', 'start|end'],
      ['grid-gap', 'grid-1-gap', 'row|column'],
      ['grid-row', '%-1', 'start|end'],
      ['grid-template', '%-1', 'columns|rows|areas'],
      ['list-style', 'list-1', 'type|position|image'],
      ['margin', '%-1', TBLR],
      ['mask', '%-1', 'image|mode|position|size|repeat|origin|clip|composite'],
      ['outline', '%-1', WSC],
      ['padding', '%-1', TBLR],
      ['text-decoration', '%-1', 'color|style|line'],
      ['text-emphasis', '%-1', 'style|color'],
      ['transition', '%-1', 'delay|duration|property|timing-function'],
    ]) {
      let res = pattern.replace(/%/g, sh);
      args.forEach((arg, i) => {
        res = arg.replace(/[^|]+/g, res.replace(new RegExp(`${i + 1}`, 'g'), '$$&'));
      });
      (shorthands[sh] = res.split('|')).forEach(r => {
        shorthandsFor[r] = sh;
      });
    }
    Object.defineProperties(CSSLint.Util, {
      shorthands: {value: shorthands},
      shorthandsFor: {value: shorthandsFor},
    });
    return shorthands;
  },

  get shorthandsFor() {
    return CSSLint.Util.shorthandsFor ||
      CSSLint.Util.shorthands && CSSLint.Util.shorthandsFor;
  },
};

//#endregion
//#region Rules

CSSLint.addRule['adjoining-classes'] = [{
  name: 'Disallow adjoining classes',
  desc: "Don't use adjoining classes.",
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-adjoining-classes',
  browsers: 'IE6',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      for (const part of selector.parts) {
        if (part.type === parser.SELECTOR_PART_TYPE) {
          let classCount = 0;
          for (const modifier of part.modifiers) {
            classCount += modifier.type === 'class';
            if (classCount > 1) {
              reporter.report('Adjoining classes: ' + selector.text, part, rule);
            }
          }
        }
      }
    }
  });
}];

CSSLint.addRule['box-model'] = [{
  name: 'Beware of broken box size',
  desc: "Don't use width or height when using padding or border.",
  url: 'https://github.com/CSSLint/csslint/wiki/Beware-of-box-model-size',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const sizeProps = {
    width:  ['border', 'border-left', 'border-right', 'padding', 'padding-left', 'padding-right'],
    height: ['border', 'border-bottom', 'border-top', 'padding', 'padding-bottom', 'padding-top'],
  };
  let properties = {};
  let boxSizing = false;
  let inRule;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      inRule = true;
      properties = {};
      boxSizing = false;
    },
    property(event) {
      if (!inRule) return;
      const name = CSSLint.Util.getPropName(event.property);
      if (sizeProps.width.includes(name) || sizeProps.height.includes(name)) {
        if (!/^0+\D*$/.test(event.value) &&
            (name !== 'border' || !/^none$/i.test(event.value))) {
          properties[name] = {
            line: event.property.line,
            col: event.property.col,
            value: event.value,
          };
        }
      } else if (/^(width|height)/i.test(name) &&
                 /^(length|percentage)/.test(event.value.parts[0].type)) {
        properties[name] = 1;
      } else if (name === 'box-sizing') {
        boxSizing = true;
      }
    },
    end() {
      inRule = false;
      if (boxSizing) return;
      for (const size in sizeProps) {
        if (!properties[size]) continue;
        for (const prop of sizeProps[size]) {
          if (prop !== 'padding' || !properties[prop]) continue;
          const {value: {parts}, line, col} = properties[prop].value;
          if (parts.length !== 2 || Number(parts[0].value) !== 0) {
            reporter.report(
              `Using ${size} with ${prop} can sometimes make elements larger than you expect.`,
              {line, col}, rule);
          }
        }
      }
    },
  });
}];

CSSLint.addRule['box-sizing'] = [{
  name: 'Disallow use of box-sizing',
  desc: "'box-sizing' isn't supported in IE6-7.",
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-box-sizing',
  browsers: 'IE6, IE7',
  tags:     ['Compatibility'],
}, (rule, parser, reporter) => {
  parser.addListener('property', event => {
    if (CSSLint.Util.getPropName(event.property) === 'box-sizing') {
      reporter.report(rule.desc, event, rule);
    }
  });
}];

CSSLint.addRule['bulletproof-font-face'] = [{
  name: 'Use the bulletproof @font-face syntax',
  desc: "Use the bulletproof @font-face syntax to avoid 404's in old IE " +
        'http://www.fontspring.com/blog/the-new-bulletproof-font-face-syntax',
  url: 'https://github.com/CSSLint/csslint/wiki/Bulletproof-font-face',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const regex = /^\s?url\(['"].+\.eot\?.*['"]\)\s*format\(['"]embedded-opentype['"]\).*$/i;
  let firstSrc = true;
  let ruleFailed = false;
  let pos;
  // Mark the start of a @font-face declaration so we only test properties inside it
  parser.addListener('startfontface', () => {
    parser.addListener('property', property);
  });
  function property(event) {
    if (CSSLint.Util.getPropName(event.property) !== 'src') return;
    const value = event.value.toString();
    pos = event;
    const matched = regex.test(value);
    if (firstSrc && !matched) {
      ruleFailed = true;
      firstSrc = false;
    } else if (!firstSrc && matched) {
      ruleFailed = false;
    }
  }
  // Back to normal rules that we don't need to test
  parser.addListener('endfontface', () => {
    parser.removeListener('property', property);
    if (!ruleFailed) return;
    reporter.report("@font-face declaration doesn't follow the fontspring bulletproof syntax.",
      pos, rule);
  });
}];

CSSLint.addRule['compatible-vendor-prefixes'] = [{
  name: 'Require compatible vendor prefixes',
  desc: 'Include all compatible vendor prefixes to reach a wider range of users.',
  url: 'https://github.com/CSSLint/csslint/wiki/Require-compatible-vendor-prefixes',
  browsers: 'All',
}, (rule, parser, reporter) => {
  // See http://peter.sh/experiments/vendor-prefixed-css-property-overview/ for details
  const compatiblePrefixes = {
    'animation': 'webkit',
    'animation-delay': 'webkit',
    'animation-direction': 'webkit',
    'animation-duration': 'webkit',
    'animation-fill-mode': 'webkit',
    'animation-iteration-count': 'webkit',
    'animation-name': 'webkit',
    'animation-play-state': 'webkit',
    'animation-timing-function': 'webkit',
    'appearance': 'webkit moz',
    'border-end': 'webkit moz',
    'border-end-color': 'webkit moz',
    'border-end-style': 'webkit moz',
    'border-end-width': 'webkit moz',
    'border-image': 'webkit moz o',
    'border-radius': 'webkit',
    'border-start': 'webkit moz',
    'border-start-color': 'webkit moz',
    'border-start-style': 'webkit moz',
    'border-start-width': 'webkit moz',
    'box-align': 'webkit moz',
    'box-direction': 'webkit moz',
    'box-flex': 'webkit moz',
    'box-lines': 'webkit',
    'box-ordinal-group': 'webkit moz',
    'box-orient': 'webkit moz',
    'box-pack': 'webkit moz',
    'box-sizing': '',
    'box-shadow': '',
    'column-count': 'webkit moz ms',
    'column-gap': 'webkit moz ms',
    'column-rule': 'webkit moz ms',
    'column-rule-color': 'webkit moz ms',
    'column-rule-style': 'webkit moz ms',
    'column-rule-width': 'webkit moz ms',
    'column-width': 'webkit moz ms',
    'flex': 'webkit ms',
    'flex-basis': 'webkit',
    'flex-direction': 'webkit ms',
    'flex-flow': 'webkit',
    'flex-grow': 'webkit',
    'flex-shrink': 'webkit',
    'hyphens': 'epub moz',
    'line-break': 'webkit ms',
    'margin-end': 'webkit moz',
    'margin-start': 'webkit moz',
    'marquee-speed': 'webkit wap',
    'marquee-style': 'webkit wap',
    'padding-end': 'webkit moz',
    'padding-start': 'webkit moz',
    'tab-size': 'moz o',
    'text-size-adjust': 'webkit ms',
    'transform': 'webkit ms',
    'transform-origin': 'webkit ms',
    'transition': '',
    'transition-delay': '',
    'transition-duration': '',
    'transition-property': '',
    'transition-timing-function': '',
    'user-modify': 'webkit moz',
    'user-select': 'webkit moz ms',
    'word-break': 'epub ms',
    'writing-mode': 'epub ms',
  };
  const applyTo = [];
  let properties = [];
  let inKeyFrame = false;
  let started = 0;

  for (const prop in compatiblePrefixes) {
    const variations = compatiblePrefixes[prop].split(' ').map(s => `-${s}-${prop}`);
    compatiblePrefixes[prop] = variations;
    applyTo.push(...variations);
  }

  parser.addListener('startrule', () => {
    started++;
    properties = [];
  });

  parser.addListener('startkeyframes', event => {
    started++;
    inKeyFrame = event.prefix || true;
    if (inKeyFrame && typeof inKeyFrame === 'string') {
      inKeyFrame = '-' + inKeyFrame + '-';
    }
  });

  parser.addListener('endkeyframes', () => {
    started--;
    inKeyFrame = false;
  });

  parser.addListener('property', event => {
    if (!started) return;
    const name = event.property.text;
    if (inKeyFrame &&
        typeof inKeyFrame === 'string' &&
        name.startsWith(inKeyFrame) ||
        !applyTo.includes(name)) {
      return;
    }
    properties.push(event.property);
  });

  parser.addListener('endrule', () => {
    started = false;
    if (!properties.length) return;
    const groups = {};
    for (const name of properties) {
      for (const prop in compatiblePrefixes) {
        const variations = compatiblePrefixes[prop];
        if (!variations.includes(name.text)) {
          continue;
        }
        if (!groups[prop]) {
          groups[prop] = {
            full: variations.slice(0),
            actual: [],
            actualNodes: [],
          };
        }
        if (!groups[prop].actual.includes(name.text)) {
          groups[prop].actual.push(name.text);
          groups[prop].actualNodes.push(name);
        }
      }
    }
    for (const prop in groups) {
      const value = groups[prop];
      const actual = value.actual;
      const len = actual.length;
      if (value.full.length <= len) continue;
      for (const item of value.full) {
        if (!actual.includes(item)) {
          const spec = len === 1 ? actual[0] : len === 2 ? actual.join(' and ') : actual.join(', ');
          reporter.report(
            `'${item}' is compatible with ${spec} and should be included as well.`,
            value.actualNodes[0], rule);
        }
      }
    }
  });
}];

CSSLint.addRule['display-property-grouping'] = [{
  name: 'Require properties appropriate for display',
  desc: "Certain properties shouldn't be used with certain display property values.",
  url: 'https://github.com/CSSLint/csslint/wiki/Require-properties-appropriate-for-display',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const propertiesToCheck = {
    'display': 1,
    'float': 'none',
    'height': 1,
    'width': 1,
    'margin': 1,
    'margin-left': 1,
    'margin-right': 1,
    'margin-bottom': 1,
    'margin-top': 1,
    'padding': 1,
    'padding-left': 1,
    'padding-right': 1,
    'padding-bottom': 1,
    'padding-top': 1,
    'vertical-align': 1,
  };
  let properties;
  let inRule;
  const reportProperty = (name, display, msg) => {
    const prop = properties[name];
    if (prop && propertiesToCheck[name] !== prop.value.toLowerCase()) {
      reporter.report(msg || `'${name}' can't be used with display: ${display}.`, prop, rule);
    }
  };
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      inRule = true;
      properties = {};
    },
    property(event) {
      if (!inRule) return;
      const name = CSSLint.Util.getPropName(event.property);
      if (name in propertiesToCheck) {
        properties[name] = {
          value: event.value.text,
          line: event.property.line,
          col: event.property.col,
        };
      }
    },
    end() {
      inRule = false;
      const display = properties.display && properties.display.value;
      if (!display) return;

      switch (display.toLowerCase()) {

        case 'inline':
          ['height', 'width', 'margin', 'margin-top', 'margin-bottom']
            .forEach(p => reportProperty(p, display));

          reportProperty('float', display,
            "'display:inline' has no effect on floated elements " +
            '(but may be used to fix the IE6 double-margin bug).');
          break;

        case 'block':
          // vertical-align should not be used with block
          reportProperty('vertical-align', display);
          break;

        case 'inline-block':
          // float should not be used with inline-block
          reportProperty('float', display);
          break;

        default:
          // margin, float should not be used with table
          if (/^table-/i.test(display)) {
            ['margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'float']
              .forEach(p => reportProperty(p, display));
          }
      }
    },
  });
}];

CSSLint.addRule['duplicate-background-images'] = [{
  name: 'Disallow duplicate background images',
  desc: 'Every background-image should be unique. Use a common class for e.g. sprites.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-duplicate-background-images',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const stack = {};
  parser.addListener('property', event => {
    if (!/^-(webkit|moz|ms|o)-background(-image)$/i.test(event.property.text)) {
      return;
    }
    for (const part of event.value.parts) {
      if (part.type !== 'uri') continue;
      const uri = stack[part.uri];
      if (!uri) {
        stack[part.uri] = event;
      } else {
        reporter.report(
          `Background image '${part.uri}' was used multiple times, ` +
          `first declared at line ${uri.line}, col ${uri.col}.`,
          event, rule);
      }
    }
  });
}];

CSSLint.addRule['duplicate-properties'] = [{
  name: 'Disallow duplicate properties',
  desc: 'Duplicate properties must appear one after the other. ' +
    'Exact duplicates are always reported.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-duplicate-properties',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let props, lastName, inRule;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      inRule = true;
      props = {};
    },
    property(event) {
      if (!inRule) return;
      const property = event.property;
      const name = property.text.toLowerCase();
      const last = props[name];
      const dupValue = last === event.value.text;
      if (last && (lastName !== name || dupValue)) {
        reporter.report(`${dupValue ? 'Duplicate' : 'Ungrouped duplicate'} '${property}'.`,
          event, rule);
      }
      props[name] = event.value.text;
      lastName = name;
    },
    end() {
      inRule = false;
    },
  });
}];

CSSLint.addRule['empty-rules'] = [{
  name: 'Disallow empty rules',
  desc: 'Rules without any properties specified should be removed.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-empty-rules',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('startrule', () => (count = 0));
  parser.addListener('property', () => count++);
  parser.addListener('endrule', event => {
    if (!count) reporter.report('Empty rule.', event.selectors[0], rule);
  });
}];

CSSLint.addRule['errors'] = [{
  name: 'Parsing Errors',
  desc: 'This rule looks for recoverable syntax errors.',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('error', e => reporter.error(e.message, e, rule));
}];

CSSLint.addRule['fallback-colors'] = [{
  name: 'Require fallback colors',
  desc: "For older browsers that don't support RGBA, HSL, or HSLA, provide a fallback color.",
  url: 'https://github.com/CSSLint/csslint/wiki/Require-fallback-colors',
  browsers: 'IE6,IE7,IE8',
}, (rule, parser, reporter) => {
  const propertiesToCheck = new Set([
    'color',
    'background',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'background-color',
  ]);
  let lastProperty;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      lastProperty = null;
    },
    property(event) {
      const name = CSSLint.Util.getPropName(event.property);
      if (!propertiesToCheck.has(name)) {
        lastProperty = event;
        return;
      }
      let colorType = '';
      for (const part of event.value.parts) {
        if (part.type !== 'color') {
          continue;
        }
        if (!('alpha' in part || 'hue' in part)) {
          event.colorType = 'compat';
          continue;
        }
        if (/([^)]+)\(/.test(part)) {
          colorType = RegExp.$1.toUpperCase();
        }
        if (!lastProperty ||
            lastProperty.colorType !== 'compat' ||
            CSSLint.Util.getPropName(lastProperty.property) !== name) {
          reporter.report(`Fallback ${name} (hex or RGB) should precede ${colorType} ${name}.`,
            event, rule);
        }
      }
      lastProperty = event;
    },
  });
}];

CSSLint.addRule['floats'] = [{
  name: 'Disallow too many floats',
  desc: 'This rule tests if the float property too many times',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-too-many-floats',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', ({property, value}) => {
    count +=
      CSSLint.Util.getPropName(property) === 'float' &&
      value.text.toLowerCase() !== 'none';
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('floats', count);
    if (count >= 10) {
      reporter.rollupWarn(
        `Too many floats (${count}), you're probably using them for layout. ` +
        'Consider using a grid system instead.', rule);
    }
  });
}];

CSSLint.addRule['font-faces'] = [{
  name: "Don't use too many web fonts",
  desc: 'Too many different web fonts in the same stylesheet.',
  url: 'https://github.com/CSSLint/csslint/wiki/Don%27t-use-too-many-web-fonts',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('startfontface', () => count++);
  parser.addListener('endstylesheet', () => {
    if (count > 5) {
      reporter.rollupWarn(`Too many @font-face declarations (${count}).`, rule);
    }
  });
}];

CSSLint.addRule['font-sizes'] = [{
  name: 'Disallow too many font sizes',
  desc: 'Checks the number of font-size declarations.',
  url: 'https://github.com/CSSLint/csslint/wiki/Don%27t-use-too-many-font-size-declarations',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', event => {
    count += CSSLint.Util.getPropName(event.property) === 'font-size';
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('font-sizes', count);
    if (count >= 10) {
      reporter.rollupWarn(`Too many font-size declarations (${count}), abstraction needed.`, rule);
    }
  });
}];

CSSLint.addRule['globals-in-document'] = [{
  name: 'Warn about global @ rules inside @-moz-document',
  desc: 'Warn about @import, @charset, @namespace inside @-moz-document',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let level = 0;
  let index = 0;
  parser.addListener('startdocument', () => level++);
  parser.addListener('enddocument', () => level-- * index++);
  const check = event => {
    if (level && index) {
      reporter.report(`A nested @${event.type} is valid only if this @-moz-document section ` +
        'is the first one matched for any given URL.', event, rule);
    }
  };
  parser.addListener('import', check);
  parser.addListener('charset', check);
  parser.addListener('namespace', check);
}];

CSSLint.addRule['gradients'] = [{
  name: 'Require all gradient definitions',
  desc: 'When using a vendor-prefixed gradient, make sure to use them all.',
  url: 'https://github.com/CSSLint/csslint/wiki/Require-all-gradient-definitions',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let gradients;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      gradients = {
        moz: 0,
        webkit: 0,
        oldWebkit: 0,
        o: 0,
      };
    },
    property(event) {
      if (/-(moz|o|webkit)(?:-(?:linear|radial))-gradient/i.test(event.value)) {
        gradients[RegExp.$1] = 1;
      } else if (/-webkit-gradient/i.test(event.value)) {
        gradients.oldWebkit = 1;
      }
    },
    end(event) {
      const missing = [];
      if (!gradients.moz) missing.push('Firefox 3.6+');
      if (!gradients.webkit) missing.push('Webkit (Safari 5+, Chrome)');
      if (!gradients.oldWebkit) missing.push('Old Webkit (Safari 4+, Chrome)');
      if (!gradients.o) missing.push('Opera 11.1+');
      if (missing.length && missing.length < 4) {
        reporter.report(`Missing vendor-prefixed CSS gradients for ${missing.join(', ')}.`,
          event.selectors[0], rule);
      }
    },
  });
}];

CSSLint.addRule['ids'] = [{
  name: 'Disallow IDs in selectors',
  desc: 'Selectors should not contain IDs.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-IDs-in-selectors',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const sel of event.selectors) {
      const cnt =
        sel.parts.reduce((sum = 0, {type, modifiers}) =>
          type === parser.SELECTOR_PART_TYPE
            ? modifiers.reduce(sum, mod => sum + (mod.type === 'id'))
            : sum);
      if (cnt) {
        reporter.report(`Id in selector${cnt > 1 ? '!'.repeat(cnt) : '.'}`, sel, rule);
      }
    }
  });
}];

CSSLint.addRule['import-ie-limit'] = [{
  name: '@import limit on IE6-IE9',
  desc: 'IE6-9 supports up to 31 @import per stylesheet',
  browsers: 'IE6, IE7, IE8, IE9',
}, (rule, parser, reporter) => {
  const MAX_IMPORT_COUNT = 31;
  let count = 0;
  parser.addListener('startpage', () => (count = 0));
  parser.addListener('import', () => count++);
  parser.addListener('endstylesheet', () => {
    if (count > MAX_IMPORT_COUNT) {
      reporter.rollupError(
        `Too many @import rules (${count}). IE6-9 supports up to 31 import per stylesheet.`,
        rule);
    }
  });
}];

CSSLint.addRule['import'] = [{
  name: 'Disallow @import',
  desc: "Don't use @import, use <link> instead.",
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-%40import',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('import', e => {
    reporter.report('@import prevents parallel downloads, use <link> instead.', e, rule);
  });
}];

CSSLint.addRule['important'] = [{
  name: 'Disallow !important',
  desc: 'Be careful when using !important declaration',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-%21important',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', event => {
    if (event.important) {
      count++;
      reporter.report('!important.', event, rule);
    }
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('important', count);
    if (count >= 10) {
      reporter.rollupWarn(
        `Too many !important declarations (${count}), ` +
        'try to use less than 10 to avoid specificity issues.', rule);
    }
  });
}];

CSSLint.addRule['known-properties'] = [{
  name: 'Require use of known properties',
  desc: 'Properties should be known (listed in CSS3 specification) or be a vendor-prefixed property.',
  url: 'https://github.com/CSSLint/csslint/wiki/Require-use-of-known-properties',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('property', event => {
    const inv = event.invalid;
    if (inv) reporter.report(inv.message, inv, rule);
  });
}];

CSSLint.addRule['order-alphabetical'] = [{
  name: 'Alphabetical order',
  desc: 'Assure properties are in alphabetical order',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let last, failed;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      last = '';
      failed = false;
    },
    property(event) {
      if (!failed) {
        const name = CSSLint.Util.getPropName(event.property);
        if (name < last) {
          reporter.report(`Non-alphabetical order: '${name}'.`, event, rule);
          failed = true;
        }
        last = name;
      }
    },
  });
}];

CSSLint.addRule['outline-none'] = [{
  name: 'Disallow outline: none',
  desc: 'Use of outline: none or outline: 0 should be limited to :focus rules.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-outline%3Anone',
  browsers: 'All',
  tags: ['Accessibility'],
}, (rule, parser, reporter) => {
  let lastRule;
  CSSLint.Util.registerRuleEvents(parser, {
    start(event) {
      lastRule = !event.selectors ? null : {
        line: event.line,
        col: event.col,
        selectors: event.selectors,
        propCount: 0,
        outline: false,
      };
    },
    property(event) {
      if (!lastRule) return;
      lastRule.propCount++;
      if (CSSLint.Util.getPropName(event.property) === 'outline' && /^(none|0)$/i.test(event.value)) {
        lastRule.outline = true;
      }
    },
    end() {
      const {outline, selectors, propCount} = lastRule || {};
      lastRule = null;
      if (!outline) return;
      if (!/:focus/i.test(selectors)) {
        reporter.report('Outlines should only be modified using :focus.', lastRule, rule);
      } else if (propCount === 1) {
        reporter.report("Outlines shouldn't be hidden unless other visual changes are made.",
          lastRule, rule);
      }
    },
  });
}];

CSSLint.addRule['overqualified-elements'] = [{
  name: 'Disallow overqualified elements',
  desc: "Don't use classes or IDs with elements (a.foo or a#foo).",
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-overqualified-elements',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const classes = {};
  const report = (part, mod) => {
    reporter.report(`'${part}' is overqualified, just use '${mod}' without element name.`,
      part, rule);
  };
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      for (const part of selector.parts) {
        if (part.type !== parser.SELECTOR_PART_TYPE) continue;
        for (const mod of part.modifiers) {
          if (part.elementName && mod.type === 'id') {
            report(part, mod);
          } else if (mod.type === 'class') {
            (classes[mod] || (classes[mod] = []))
              .push({modifier: mod, part});
          }
        }
      }
    }
  });
  // one use means that this is overqualified
  parser.addListener('endstylesheet', () => {
    for (const prop of Object.values(classes)) {
      const {part, modifier} = prop[0];
      if (part.elementName && prop.length === 1) {
        report(part, modifier);
      }
    }
  });
}];

CSSLint.addRule['qualified-headings'] = [{
  name: 'Disallow qualified headings',
  desc: 'Headings should not be qualified (namespaced).',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-qualified-headings',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      let first = true;
      for (const part of selector.parts) {
        const name = part.elementName;
        if (!first &&
            name &&
            part.type === parser.SELECTOR_PART_TYPE &&
            /h[1-6]/.test(name.toString())) {
          reporter.report(`Heading '${name}' should not be qualified.`, part, rule);
        }
        first = false;
      }
    }
  });
}];

CSSLint.addRule['regex-selectors'] = [{
  name: 'Disallow selectors that look like regexs',
  desc: 'Selectors that look like regular expressions are slow and should be avoided.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-selectors-that-look-like-regular-expressions',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      for (const part of selector.parts) {
        if (part.type === parser.SELECTOR_PART_TYPE) {
          for (const mod of part.modifiers) {
            if (mod.type === 'attribute' && /([~|^$*]=)/.test(mod)) {
              reporter.report(`Slow attribute selector ${RegExp.$1}.`, mod, rule);
            }
          }
        }
      }
    }
  });
}];

CSSLint.addRule['rules-count'] = [{
  name: 'Rules Count',
  desc: 'Track how many rules there are.',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('startrule', () => count++);
  parser.addListener('endstylesheet', () => reporter.stat('rule-count', count));
}];

CSSLint.addRule['selector-max'] = [{
  name: 'Error when past the 4095 selector limit for IE',
  desc: 'Will error when selector count is > 4095.',
  browsers: 'IE',
}, (rule, parser, reporter, limit = 4095) => {
  let count = 0;
  parser.addListener('startrule', event => {
    count += event.selectors.length;
  });
  parser.addListener('endstylesheet', () => {
    if (count > limit) {
      reporter.report(count + ' selectors found. ' +
                      'Internet Explorer supports a maximum of 4095 selectors per stylesheet. ' +
                      'Consider refactoring.', {}, rule);
    }
  });
}];

CSSLint.addRule['selector-max-approaching'] = [{
  name: 'Warn when approaching the 4095 selector limit for IE',
  desc: 'Will warn when selector count is >= 3800 selectors.',
  browsers: 'IE',
}, (rule, parser, reporter) => {
  CSSLint.rules['selector-max'].init(rule, parser, reporter, Number(rule.desc.match(/\d+/)[0]));
}];

CSSLint.addRule['selector-newline'] = [{
  name: 'Disallow new-line characters in selectors',
  desc: 'New-line characters in selectors are usually a forgotten comma and not a descendant combinator.',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      for (let i = 0, p, pn; i < parts.length - 1 && (p = parts[i]); i++) {
        if (p.type === 'descendant' && (pn = parts[i + 1]).line > p.line) {
          reporter.report('Line break in selector (forgot a comma?)', pn, rule);
        }
      }
    }
  });
}];

CSSLint.addRule['shorthand'] = [{
  name: 'Require shorthand properties',
  desc: 'Use shorthand properties where possible.',
  url: 'https://github.com/CSSLint/csslint/wiki/Require-shorthand-properties',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const {shorthands} = CSSLint.Util;
  CSSLint.Util.registerShorthandEvents(parser, {
    end(event, props) {
      for (const [sh, events] of Object.entries(props)) {
        const names = Object.keys(events);
        if (names.length === shorthands[sh].length) {
          const msg = `'${sh}' shorthand can replace '${names.join("' + '")}'`;
          names.forEach(n => reporter.report(msg, events[n], rule));
        }
      }
    },
  });
}];

CSSLint.addRule['shorthand-overrides'] = [{
  name: 'Avoid shorthands that override individual properties',
  desc: 'Avoid shorthands like `background: foo` that follow individual properties ' +
    'like `background-image: bar` thus overriding them',
  browsers: 'All',
}, (rule, parser, reporter) => {
  CSSLint.Util.registerShorthandEvents(parser, {
    property(event, props, name) {
      const ovr = props[name];
      if (ovr) {
        delete props[name];
        reporter.report(`'${event.property}' overrides '${Object.keys(ovr).join("', '")}' above.`,
          event, rule);
      }
    },
  });
}];

CSSLint.addRule['simple-not'] = [{
  name: 'Require use of simple selectors inside :not()',
  desc: 'A complex selector inside :not() is only supported by CSS4-compliant browsers.',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', e => {
    for (const sel of e.selectors) {
      if (!/:not\(/i.test(sel.text)) continue;
      for (const part of sel.parts) {
        if (!part.modifiers) continue;
        for (const mod of part.modifiers) {
          if (mod.type !== 'not') continue;
          const {args} = mod;
          const {parts} = args[0];
          if (args.length > 1 ||
              parts.length !== 1 ||
              parts[0].modifiers.length + (parts[0].elementName ? 1 : 0) > 1 ||
              /^:not\(/i.test(parts[0])) {
            reporter.report('Complex selector inside :not().', args[0], rule);
          }
        }
      }
    }
  });
}];

CSSLint.addRule['star-property-hack'] = [{
  name: 'Disallow properties with a star prefix',
  desc: 'Checks for the star property hack (targets IE6/7)',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-star-hack',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('property', ({property}) => {
    if (property.hack === '*') {
      reporter.report('IE star prefix.', property, rule);
    }
  });
}];

CSSLint.addRule['text-indent'] = [{
  name: 'Disallow negative text-indent',
  desc: 'Checks for text indent less than -99px',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-negative-text-indent',
  browsers: 'All',
}, (rule, parser, reporter) => {
  let textIndent, isLtr;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      textIndent = false;
      isLtr = false;
    },
    property(event) {
      const name = CSSLint.Util.getPropName(event.property);
      const value = event.value;
      if (name === 'text-indent' && value.parts[0].value < -99) {
        textIndent = event.property;
      } else if (name === 'direction' && /^ltr$/i.test(value)) {
        isLtr = true;
      }
    },
    end() {
      if (textIndent && !isLtr) {
        reporter.report(
          "Negative 'text-indent' doesn't work well with RTL. " +
          "If you use 'text-indent' for image replacement, " +
          "explicitly set 'direction' for that item to 'ltr'.",
          textIndent, rule);
      }
    },
  });
}];

CSSLint.addRule['underscore-property-hack'] = [{
  name: 'Disallow properties with an underscore prefix',
  desc: 'Checks for the underscore property hack (targets IE6)',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-underscore-hack',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('property', ({property}) => {
    if (property.hack === '_') {
      reporter.report('IE underscore prefix.', property, rule);
    }
  });
}];

CSSLint.addRule['unique-headings'] = [{
  name: 'Headings should only be defined once',
  desc: 'Headings should be defined only once.',
  url: 'https://github.com/CSSLint/csslint/wiki/Headings-should-only-be-defined-once',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const headings = new Array(6).fill(0);
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      const p = parts[parts.length - 1];
      if (/h([1-6])/i.test(p.elementName) &&
          !p.modifiers.some(mod => mod.type === 'pseudo') &&
          ++headings[RegExp.$1 - 1] > 1) {
        reporter.report(`Heading ${p.elementName} has already been defined.`, p, rule);
      }
    }
  });
  parser.addListener('endstylesheet', () => {
    const stats = headings
      .filter(h => h > 1)
      .map((h, i) => `${h} H${i + 1}s`);
    if (stats.length) {
      reporter.rollupWarn(stats.join(', '), rule);
    }
  });
}];

CSSLint.addRule['universal-selector'] = [{
  name: 'Disallow universal selector',
  desc: 'The universal selector (*) is known to be slow.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-universal-selector',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      const part = parts[parts.length - 1];
      if (part.elementName === '*') {
        reporter.report(rule.desc, part, rule);
      }
    }
  });
}];

CSSLint.addRule['unqualified-attributes'] = [{
  name: 'Disallow unqualified attribute selectors',
  desc: 'Unqualified attribute selectors are known to be slow.',
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-unqualified-attribute-selectors',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      const part = parts[parts.length - 1];
      if (part.type === parser.SELECTOR_PART_TYPE &&
          !part.modifiers.some(mod => mod.type === 'class' || mod.type === 'id')) {
        const isUnqualified = !part.elementName || part.elementName === '*';
        for (const mod of part.modifiers) {
          if (mod.type === 'attribute' && isUnqualified) {
            reporter.report(rule.desc, part, rule);
          }
        }
      }
    }
  });
}];

CSSLint.addRule['vendor-prefix'] = [{
  name: 'Require standard property with vendor prefix',
  desc: 'When using a vendor-prefixed property, make sure to include the standard one.',
  url: 'https://github.com/CSSLint/csslint/wiki/Require-standard-property-with-vendor-prefix',
  browsers: 'All',
}, (rule, parser, reporter) => {
  const propertiesToCheck = {
    '-webkit-border-radius': 'border-radius',
    '-webkit-border-top-left-radius': 'border-top-left-radius',
    '-webkit-border-top-right-radius': 'border-top-right-radius',
    '-webkit-border-bottom-left-radius': 'border-bottom-left-radius',
    '-webkit-border-bottom-right-radius': 'border-bottom-right-radius',
    '-o-border-radius': 'border-radius',
    '-o-border-top-left-radius': 'border-top-left-radius',
    '-o-border-top-right-radius': 'border-top-right-radius',
    '-o-border-bottom-left-radius': 'border-bottom-left-radius',
    '-o-border-bottom-right-radius': 'border-bottom-right-radius',
    '-moz-border-radius': 'border-radius',
    '-moz-border-radius-topleft': 'border-top-left-radius',
    '-moz-border-radius-topright': 'border-top-right-radius',
    '-moz-border-radius-bottomleft': 'border-bottom-left-radius',
    '-moz-border-radius-bottomright': 'border-bottom-right-radius',
    '-moz-column-count': 'column-count',
    '-webkit-column-count': 'column-count',
    '-moz-column-gap': 'column-gap',
    '-webkit-column-gap': 'column-gap',
    '-moz-column-rule': 'column-rule',
    '-webkit-column-rule': 'column-rule',
    '-moz-column-rule-style': 'column-rule-style',
    '-webkit-column-rule-style': 'column-rule-style',
    '-moz-column-rule-color': 'column-rule-color',
    '-webkit-column-rule-color': 'column-rule-color',
    '-moz-column-rule-width': 'column-rule-width',
    '-webkit-column-rule-width': 'column-rule-width',
    '-moz-column-width': 'column-width',
    '-webkit-column-width': 'column-width',
    '-webkit-column-span': 'column-span',
    '-webkit-columns': 'columns',
    '-moz-box-shadow': 'box-shadow',
    '-webkit-box-shadow': 'box-shadow',
    '-moz-transform': 'transform',
    '-webkit-transform': 'transform',
    '-o-transform': 'transform',
    '-ms-transform': 'transform',
    '-moz-transform-origin': 'transform-origin',
    '-webkit-transform-origin': 'transform-origin',
    '-o-transform-origin': 'transform-origin',
    '-ms-transform-origin': 'transform-origin',
    '-moz-box-sizing': 'box-sizing',
    '-webkit-box-sizing': 'box-sizing',
  };
  let properties, num, inRule;
  CSSLint.Util.registerRuleEvents(parser, {
    start() {
      inRule = true;
      properties = {};
      num = 1;
    },
    property(event) {
      if (!inRule) return;
      const name = CSSLint.Util.getPropName(event.property);
      let prop = properties[name];
      if (!prop) prop = properties[name] = [];
      prop.push({
        name: event.property,
        value: event.value,
        pos: num++,
      });
    },
    end() {
      inRule = false;
      const needsStandard = [];
      for (const prop in properties) {
        if (prop in propertiesToCheck) {
          needsStandard.push({
            actual: prop,
            needed: propertiesToCheck[prop],
          });
        }
      }
      for (const {needed, actual} of needsStandard) {
        const unit = properties[actual][0].name;
        if (!properties[needed]) {
          reporter.report(`Missing standard property '${needed}' to go along with '${actual}'.`,
            unit, rule);
        } else if (properties[needed][0].pos < properties[actual][0].pos) {
          reporter.report(
            `Standard property '${needed}' should come after vendor-prefixed property '${actual}'.`,
            unit, rule);
        }
      }
    },
  });
}];

CSSLint.addRule['warnings'] = [{
  name: 'Parsing warnings',
  desc: 'This rule looks for parser warnings.',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('warning', e => reporter.report(e.message, e, rule));
}];

CSSLint.addRule['zero-units'] = [{
  name: 'Disallow units for 0 values',
  desc: "You don't need to specify units when a value is 0.",
  url: 'https://github.com/CSSLint/csslint/wiki/Disallow-units-for-zero-values',
  browsers: 'All',
}, (rule, parser, reporter) => {
  parser.addListener('property', event => {
    for (const p of event.value.parts) {
      if (p.value === 0 && (p.units || p.type === 'percentage') && p.type !== 'time') {
        reporter.report("'0' value with redundant units.", p, rule);
      }
    }
  });
}];

//#endregion
