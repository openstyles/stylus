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

//region Reporter

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
   * @param {[][]} ingore - list of line ranges to be ignored
   */
  constructor(lines, ruleset, allow, ignore) {
    this.messages = [];
    this.stats = [];
    this.lines = lines;
    this.ruleset = ruleset;
    this.allow = allow || {};
    this.ignore = ignore || [];
  }

  error(message, line, col, rule = {}) {
    this.messages.push({
      type:     'error',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  report(message, line, col, rule) {
    if (line in this.allow && rule.id in this.allow[line] ||
        this.ignore.some(range => range[0] <= line && line <= range[1])) {
      return;
    }
    this.messages.push({
      type:     this.ruleset[rule.id] === 2 ? 'error' : 'warning',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  info(message, line, col, rule) {
    this.messages.push({
      type:     'info',
      evidence: this.lines[line - 1],
      line, col,
      message,
      rule,
    });
  }

  rollupError(message, rule) {
    this.messages.push({
      type:   'error',
      rollup: true,
      message,
      rule,
    });
  }

  rollupWarn(message, rule) {
    this.messages.push({
      type:   'warning',
      rollup: true,
      message,
      rule,
    });
  }

  stat(name, value) {
    this.stats[name] = value;
  }
}

//endregion
//region CSSLint

//eslint-disable-next-line no-var
var CSSLint = (() => {

  const RX_EMBEDDED = /\/\*\s*csslint\s+((?:[^*]|\*(?!\/))+?)\*\//ig;
  const EBMEDDED_RULE_VALUE_MAP = {
    // error
    'true':  2,
    '2':     2,
    // warning
    '':      1,
    '1':     1,
    // ignore
    'false': 0,
    '0':     0,
  };
  const rules = [];

  // previous CSSLint overrides are used to decide whether the parserlib's cache should be reset
  let prevOverrides;

  return Object.assign(new parserlib.util.EventTarget(), {

    addRule(rule) {
      rules.push(rule);
      rules[rule.id] = rule;
    },

    clearRules() {
      rules.length = 0;
    },

    getRules() {
      return rules
        .slice()
        .sort((a, b) =>
          a.id < b.id ? -1 :
            a.id > b.id ? 1 : 0);
    },

    getRuleset() {
      const ruleset = {};
      // by default, everything is a warning
      for (const rule of rules) {
        ruleset[rule.id] = 1;
      }
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

      if (!ruleset) ruleset = this.getRuleset();

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
        starHack:       true,
        ieFilters:      true,
        underscoreHack: true,
        strict:         false,
      });

      const reporter = new Reporter([], ruleset, allow, ignore);

      // always report parsing errors as errors
      ruleset.errors = 2;
      Object.keys(ruleset).forEach(id =>
        ruleset[id] &&
        rules[id] &&
        rules[id].init(parser, reporter));

      // TODO: when ruleset is unchanged we can try to invalidate only line ranges in 'allow' and 'ignore'
      const newOvr = [ruleset, allow, ignore];
      const reuseCache = !prevOverrides || JSON.stringify(prevOverrides) === JSON.stringify(newOvr);
      prevOverrides = newOvr;

      try {
        parser.parse(text, {reuseCache});
      } catch (ex) {
        reporter.error('Fatal error, cannot continue: ' + ex.message, ex.line, ex.col, {});
      }

      const report = {
        messages: reporter.messages,
        stats:    reporter.stats,
        ruleset:  reporter.ruleset,
        allow:    reporter.allow,
        ignore:   reporter.ignore,
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
      // the chunk of code where errors won't be reported
      // the chunk's start is hardwired to the line of the opening comment
      // the chunk's end is hardwired to the line of the closing comment
  /* csslint ignore:end */

  // Example 2:

  /* csslint allow:rulename1,rulename2,... */
      // allows to break the specified rules on the next single line of code

  // Example 3:

  /* csslint rulename1 */
  /* csslint rulename2:N */
  /* csslint rulename3:N, rulename4:N */

      // entire code is affected;
      // comments futher down the code extend/override previous comments of this kind
      // values for N:
      // "2" or "true" means "error"
      // "1" or nothing means "warning" - note in this case ":" can also be omitted
      // "0" or "false" means "ignore"
      // (the quotes are added here for convenience, don't put them in the actual comments)

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
          if (num) allow[lineno + 1] = allowRuleset;
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

//endregion
//region Util

// expose for testing purposes
CSSLint._Reporter = Reporter;

CSSLint.Util = {

  indexOf(values, value) {
    if (typeof values.indexOf === 'function') {
      return values.indexOf(value);
    }
    for (let i = 0, len = values.length; i < len; i++) {
      if (values[i] === value) {
        return i;
      }
    }
    return -1;
  },

  registerBlockEvents(parser, start, end, property) {
    for (const e of [
      'document',
      'fontface',
      'keyframerule',
      'media',
      'page',
      'pagemargin',
      'rule',
      'supports',
      'viewport',
    ]) {
      if (start) parser.addListener('start' + e, start);
      if (end) parser.addListener('end' + e, end);
    }
    if (property) parser.addListener('property', property);
  },
};

//endregion
//region Rules

CSSLint.addRule({
  id:       'adjoining-classes',
  name:     'Disallow adjoining classes',
  desc:     "Don't use adjoining classes.",
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-adjoining-classes',
  browsers: 'IE6',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const selector of event.selectors) {
        for (const part of selector.parts) {
          if (part.type !== parser.SELECTOR_PART_TYPE) continue;
          let classCount = 0;
          for (const modifier of part.modifiers) {
            classCount += modifier.type === 'class';
            if (classCount > 1) {
              reporter.report('Adjoining classes: ' + selector.text, part.line, part.col, this);
            }
          }
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'box-model',
  name:     'Beware of broken box size',
  desc:     "Don't use width or height when using padding or border.",
  url:      'https://github.com/CSSLint/csslint/wiki/Beware-of-box-model-size',
  browsers: 'All',

  init(parser, reporter) {
    const sizeProps = {
      width:  [
        'border',
        'border-left',
        'border-right',
        'padding',
        'padding-left',
        'padding-right',
      ],
      height: [
        'border',
        'border-bottom',
        'border-top',
        'padding',
        'padding-bottom',
        'padding-top',
      ],
    };
    let properties = {};
    let boxSizing = false;
    let started = 0;

    const startRule = () => {
      started = 1;
      properties = {};
      boxSizing = false;
    };

    const property = event => {
      if (!started) return;
      const name = event.property.text.toLowerCase();

      if (sizeProps.width.includes(name) || sizeProps.height.includes(name)) {

        if (!/^0+\D*$/.test(event.value) &&
            (name !== 'border' || !/^none$/i.test(event.value))) {
          properties[name] = {
            line:  event.property.line,
            col:   event.property.col,
            value: event.value,
          };
        }

      } else if (/^(width|height)/i.test(name) &&
                 /^(length|percentage)/.test(event.value.parts[0].type)) {
        properties[name] = 1;

      } else if (name === 'box-sizing') {
        boxSizing = true;
      }
    };

    const endRule = () => {
      started = 0;
      if (boxSizing) return;

      for (const size in sizeProps) {
        if (!properties[size]) continue;

        for (const prop of sizeProps[size]) {
          if (prop !== 'padding' || !properties[prop]) continue;

          const {value: {parts}, line, col} = properties[prop].value;
          if (parts.length !== 2 || Number(parts[0].value) !== 0) {
            reporter.report(`Using ${size} with ${prop} can sometimes make elements larger than you expect.`,
              line, col, this);
          }
        }
      }
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, property);
  },
});

CSSLint.addRule({
  id:       'box-sizing',
  name:     'Disallow use of box-sizing',
  desc:     "The box-sizing properties isn't supported in IE6 and IE7.",
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-box-sizing',
  browsers: 'IE6, IE7',
  tags:     ['Compatibility'],

  init(parser, reporter) {
    parser.addListener('property', event => {
      if (event.property.text.toLowerCase() === 'box-sizing') {
        reporter.report(this.desc, event.line, event.col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'bulletproof-font-face',
  name:     'Use the bulletproof @font-face syntax',
  desc:     'Use the bulletproof @font-face syntax to avoid 404\'s in old IE ' +
            '(http://www.fontspring.com/blog/the-new-bulletproof-font-face-syntax).',
  url:      'https://github.com/CSSLint/csslint/wiki/Bulletproof-font-face',
  browsers: 'All',

  init(parser, reporter) {
    const regex = /^\s?url\(['"].+\.eot\?.*['"]\)\s*format\(['"]embedded-opentype['"]\).*$/i;
    let firstSrc = true;
    let ruleFailed = false;
    let line, col;

    // Mark the start of a @font-face declaration so we only test properties inside it
    parser.addListener('startfontface', () => {
      parser.addListener('property', property);
    });

    function property(event) {
      const propertyName = event.property.toString().toLowerCase();
      if (propertyName !== 'src') return;

      const value = event.value.toString();
      line = event.line;
      col = event.col;

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
        line, col, this);
    });
  },
});

CSSLint.addRule({
  id:       'compatible-vendor-prefixes',
  name:     'Require compatible vendor prefixes',
  desc:     'Include all compatible vendor prefixes to reach a wider range of users.',
  url:      'https://github.com/CSSLint/csslint/wiki/Require-compatible-vendor-prefixes',
  browsers: 'All',

  init(parser, reporter) {
    // See http://peter.sh/experiments/vendor-prefixed-css-property-overview/ for details
    const compatiblePrefixes = {
      'animation':                  'webkit',
      'animation-delay':            'webkit',
      'animation-direction':        'webkit',
      'animation-duration':         'webkit',
      'animation-fill-mode':        'webkit',
      'animation-iteration-count':  'webkit',
      'animation-name':             'webkit',
      'animation-play-state':       'webkit',
      'animation-timing-function':  'webkit',
      'appearance':                 'webkit moz',
      'border-end':                 'webkit moz',
      'border-end-color':           'webkit moz',
      'border-end-style':           'webkit moz',
      'border-end-width':           'webkit moz',
      'border-image':               'webkit moz o',
      'border-radius':              'webkit',
      'border-start':               'webkit moz',
      'border-start-color':         'webkit moz',
      'border-start-style':         'webkit moz',
      'border-start-width':         'webkit moz',
      'box-align':                  'webkit moz',
      'box-direction':              'webkit moz',
      'box-flex':                   'webkit moz',
      'box-lines':                  'webkit',
      'box-ordinal-group':          'webkit moz',
      'box-orient':                 'webkit moz',
      'box-pack':                   'webkit moz',
      'box-sizing':                 '',
      'box-shadow':                 '',
      'column-count':               'webkit moz ms',
      'column-gap':                 'webkit moz ms',
      'column-rule':                'webkit moz ms',
      'column-rule-color':          'webkit moz ms',
      'column-rule-style':          'webkit moz ms',
      'column-rule-width':          'webkit moz ms',
      'column-width':               'webkit moz ms',
      'flex':                       'webkit ms',
      'flex-basis':                 'webkit',
      'flex-direction':             'webkit ms',
      'flex-flow':                  'webkit',
      'flex-grow':                  'webkit',
      'flex-shrink':                'webkit',
      'hyphens':                    'epub moz',
      'line-break':                 'webkit ms',
      'margin-end':                 'webkit moz',
      'margin-start':               'webkit moz',
      'marquee-speed':              'webkit wap',
      'marquee-style':              'webkit wap',
      'padding-end':                'webkit moz',
      'padding-start':              'webkit moz',
      'tab-size':                   'moz o',
      'text-size-adjust':           'webkit ms',
      'transform':                  'webkit ms',
      'transform-origin':           'webkit ms',
      'transition':                 '',
      'transition-delay':           '',
      'transition-duration':        '',
      'transition-property':        '',
      'transition-timing-function': '',
      'user-modify':                'webkit moz',
      'user-select':                'webkit moz ms',
      'word-break':                 'epub ms',
      'writing-mode':               'epub ms',
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
          CSSLint.Util.indexOf(applyTo, name) < 0) {
        return;
      }
      properties.push(event.property);
    });

    parser.addListener('endrule', () => {
      started = 0;
      if (!properties.length) return;
      const propertyGroups = {};

      for (const name of properties) {
        for (const prop in compatiblePrefixes) {
          const variations = compatiblePrefixes[prop];
          if (CSSLint.Util.indexOf(variations, name.text) <= -1) continue;

          if (!propertyGroups[prop]) {
            propertyGroups[prop] = {
              full:        variations.slice(0),
              actual:      [],
              actualNodes: [],
            };
          }

          if (CSSLint.Util.indexOf(propertyGroups[prop].actual, name.text) === -1) {
            propertyGroups[prop].actual.push(name.text);
            propertyGroups[prop].actualNodes.push(name);
          }
        }
      }

      for (const prop in propertyGroups) {
        const value = propertyGroups[prop];
        const actual = value.actual;
        if (value.full.length <= actual.length) continue;

        for (const item of value.full) {
          if (CSSLint.Util.indexOf(actual, item) !== -1) continue;

          const propertiesSpecified =
            actual.length === 1 ?
              actual[0] :
              actual.length === 2 ?
                actual.join(' and ') :
                actual.join(', ');

          const {line, col} = value.actualNodes[0];
          reporter.report(
            `The property ${item} is compatible with ${propertiesSpecified} and should be included as well.`,
            line, col, this);
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'display-property-grouping',
  name:     'Require properties appropriate for display',
  desc:     "Certain properties shouldn't be used with certain display property values.",
  url:      'https://github.com/CSSLint/csslint/wiki/Require-properties-appropriate-for-display',
  browsers: 'All',

  init(parser, reporter) {
    const propertiesToCheck = {
      'display':        1,
      'float':          'none',
      'height':         1,
      'width':          1,
      'margin':         1,
      'margin-left':    1,
      'margin-right':   1,
      'margin-bottom':  1,
      'margin-top':     1,
      'padding':        1,
      'padding-left':   1,
      'padding-right':  1,
      'padding-bottom': 1,
      'padding-top':    1,
      'vertical-align': 1,
    };
    let properties;
    let started = 0;

    const startRule = () => {
      started = 1;
      properties = {};
    };

    const property = event => {
      if (!started) return;
      const name = event.property.text.toLowerCase();
      if (name in propertiesToCheck) {
        properties[name] = {
          value: event.value.text,
          line:  event.property.line,
          col:   event.property.col,
        };
      }
    };

    const reportProperty = (name, display, msg) => {
      const prop = properties[name];
      if (!prop) return;

      const toCheck = propertiesToCheck[name];
      if (typeof toCheck === 'string' && toCheck === prop.value.toLowerCase()) return;

      const {line, col} = prop;
      reporter.report(msg || `${name} can't be used with display: ${display}.`,
        line, col, this);
    };

    const endRule = () => {
      started = 0;
      const display = properties.display && properties.display.value;
      if (!display) return;

      switch (display.toLowerCase()) {

        case 'inline':
          ['height', 'width', 'margin', 'margin-top', 'margin-bottom']
            .forEach(p => reportProperty(p, display));

          reportProperty('float', display,
            'display:inline has no effect on floated elements ' +
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
          if (display.indexOf('table-') !== 0) {
            return;
          }
          ['margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'float']
            .forEach(p => reportProperty(p, display));
      }
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, property);
  },
});

CSSLint.addRule({
  id:       'duplicate-background-images',
  name:     'Disallow duplicate background images',
  desc:     'Every background-image should be unique. Use a common class for e.g. sprites.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-duplicate-background-images',
  browsers: 'All',

  init(parser, reporter) {
    const stack = {};

    parser.addListener('property', event => {
      const name = event.property.text;
      if (!name.match(/background/i)) return;

      for (const part of event.value.parts) {
        if (part.type !== 'uri') continue;

        const uri = stack[part.uri];
        if (uri === undefined) {
          stack[part.uri] = event;
          continue;
        }

        reporter.report(
          `Background image '${part.uri}' was used multiple times, ` +
          `first declared at line ${uri.line}, col ${uri.col}.`,
          event.line, event.col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'duplicate-properties',
  name:     'Disallow duplicate properties',
  desc:     'Duplicate properties must appear one after the other.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-duplicate-properties',
  browsers: 'All',

  init(parser, reporter) {
    let properties, lastName;
    let started = 0;

    const startRule = () => {
      started = 1;
      properties = {};
    };

    const endRule = () => {
      started = 0;
      properties = {};
    };

    const property = event => {
      if (!started) return;
      const property = event.property;
      const name = property.text.toLowerCase();
      const last = properties[name];
      if (last && (lastName !== name || last === event.value.text)) {
        reporter.report(`Duplicate property '${property}' found.`, event.line, event.col, this);
      }
      properties[name] = event.value.text;
      lastName = name;
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, property);
  },
});

CSSLint.addRule({
  id:       'empty-rules',
  name:     'Disallow empty rules',
  desc:     'Rules without any properties specified should be removed.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-empty-rules',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;
    parser.addListener('startrule', () => (count = 0));
    parser.addListener('property', () => count++);
    parser.addListener('endrule', event => {
      if (!count) {
        const {line, col} = event.selectors[0];
        reporter.report('Rule is empty.', line, col, this);
      }
    });
  },

});

CSSLint.addRule({
  id:       'errors',
  name:     'Parsing Errors',
  desc:     'This rule looks for recoverable syntax errors.',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('error', ({message, line, col}) => {
      reporter.error(message, line, col, this);
    });
  },
});

CSSLint.addRule({
  id:       'warnings',
  name:     'Parsing warnings',
  desc:     'This rule looks for parser warnings.',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('warning', ({message, line, col}) => {
      reporter.report(message, line, col, this);
    });
  },
});

CSSLint.addRule({
  id:       'fallback-colors',
  name:     'Require fallback colors',
  desc:     "For older browsers that don't support RGBA, HSL, or HSLA, provide a fallback color.",
  url:      'https://github.com/CSSLint/csslint/wiki/Require-fallback-colors',
  browsers: 'IE6,IE7,IE8',

  init(parser, reporter) {
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
    const startRule = () => (lastProperty = null);

    CSSLint.Util.registerBlockEvents(parser, startRule, null, event => {
      const name = event.property.text.toLowerCase();
      if (!propertiesToCheck.has(name)) {
        lastProperty = event;
        return;
      }

      let colorType = '';
      for (const part of event.value.parts) {
        if (part.type !== 'color') continue;

        if (!('alpha' in part || 'hue' in part)) {
          event.colorType = 'compat';
          continue;
        }

        if (/([^)]+)\(/.test(part)) {
          colorType = RegExp.$1.toUpperCase();
        }

        if (!lastProperty ||
            lastProperty.property.text.toLowerCase() !== name ||
            lastProperty.colorType !== 'compat') {
          reporter.report(`Fallback ${name} (hex or RGB) should precede ${colorType} ${name}.`,
            event.line, event.col, this);
        }
      }
      lastProperty = event;
    });
  },
});

CSSLint.addRule({
  id:       'floats',
  name:     'Disallow too many floats',
  desc:     'This rule tests if the float property is used too many times',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-too-many-floats',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;

    parser.addListener('property', ({property, value}) => {
      count +=
        property.text.toLowerCase() === 'float' &&
        value.text.toLowerCase() !== 'none';
    });

    parser.addListener('endstylesheet', () => {
      reporter.stat('floats', count);
      if (count >= 10) {
        reporter.rollupWarn(
          `Too many floats (${count}), you're probably using them for layout. ` +
          'Consider using a grid system instead.', this);
      }
    });
  },

});

CSSLint.addRule({
  id:       'font-faces',
  name:     "Don't use too many web fonts",
  desc:     'Too many different web fonts in the same stylesheet.',
  url:      'https://github.com/CSSLint/csslint/wiki/Don%27t-use-too-many-web-fonts',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;
    parser.addListener('startfontface', () => count++);
    parser.addListener('endstylesheet', () => {
      if (count > 5) {
        reporter.rollupWarn(`Too many @font-face declarations (${count}).`, this);
      }
    });
  },

});

CSSLint.addRule({
  id:       'font-sizes',
  name:     'Disallow too many font sizes',
  desc:     'Checks the number of font-size declarations.',
  url:      'https://github.com/CSSLint/csslint/wiki/Don%27t-use-too-many-font-size-declarations',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;

    parser.addListener('property', event => {
      count += event.property.toString() === 'font-size';
    });

    parser.addListener('endstylesheet', () => {
      reporter.stat('font-sizes', count);
      if (count >= 10) {
        reporter.rollupWarn('Too many font-size declarations (' + count + '), abstraction needed.', this);
      }
    });
  },

});

CSSLint.addRule({

  id:       'gradients',
  name:     'Require all gradient definitions',
  desc:     'When using a vendor-prefixed gradient, make sure to use them all.',
  url:      'https://github.com/CSSLint/csslint/wiki/Require-all-gradient-definitions',
  browsers: 'All',

  init(parser, reporter) {
    let gradients;

    parser.addListener('startrule', () => {
      gradients = {
        moz:       0,
        webkit:    0,
        oldWebkit: 0,
        o:         0,
      };
    });

    parser.addListener('property', event => {
      if (/-(moz|o|webkit)(?:-(?:linear|radial))-gradient/i.test(event.value)) {
        gradients[RegExp.$1] = 1;
      } else if (/-webkit-gradient/i.test(event.value)) {
        gradients.oldWebkit = 1;
      }
    });

    parser.addListener('endrule', event => {
      const missing = [];
      if (!gradients.moz) missing.push('Firefox 3.6+');
      if (!gradients.webkit) missing.push('Webkit (Safari 5+, Chrome)');
      if (!gradients.oldWebkit) missing.push('Old Webkit (Safari 4+, Chrome)');
      if (!gradients.o) missing.push('Opera 11.1+');
      if (missing.length && missing.length < 4) {
        const {line, col} = event.selectors[0];
        reporter.report(`Missing vendor-prefixed CSS gradients for ${missing.join(', ')}.`,
          line, col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'ids',
  name:     'Disallow IDs in selectors',
  desc:     'Selectors should not contain IDs.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-IDs-in-selectors',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const {line, col, parts} of event.selectors) {
        const idCount =
          parts.reduce((sum = 0, {type, modifiers}) =>
            type === parser.SELECTOR_PART_TYPE ?
              modifiers.reduce(sum, mod => sum + (mod.type === 'id')) :
              sum);
        if (idCount === 1) {
          reporter.report("Don't use IDs in selectors.", line, col, this);
        } else if (idCount > 1) {
          reporter.report(idCount + ' IDs in the selector, really?', line, col, this);
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'import-ie-limit',
  name:     '@import limit on IE6-IE9',
  desc:     'IE6-9 supports up to 31 @import per stylesheet',
  browsers: 'IE6, IE7, IE8, IE9',

  init(parser, reporter) {
    const MAX_IMPORT_COUNT = 31;
    let count = 0;
    parser.addListener('startpage', () => (count = 0));
    parser.addListener('import', () => count++);
    parser.addListener('endstylesheet', () => {
      if (count > MAX_IMPORT_COUNT) {
        reporter.rollupError(`Too many @import rules (${count}). IE6-9 supports up to 31 import per stylesheet.`, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'import',
  name:     'Disallow @import',
  desc:     "Don't use @import, use <link> instead.",
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-%40import',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('import', ({line, col}) => {
      reporter.report('@import prevents parallel downloads, use <link> instead.', line, col, this);
    });
  },
});

CSSLint.addRule({
  id:       'important',
  name:     'Disallow !important',
  desc:     'Be careful when using !important declaration',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-%21important',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;

    parser.addListener('property', event => {
      if (!event.important) return;
      count++;
      reporter.report('Use of !important', event.line, event.col, this);
    });

    parser.addListener('endstylesheet', () => {
      reporter.stat('important', count);
      if (count >= 10) {
        reporter.rollupWarn(
          `Too many !important declarations (${count}), ` +
          'try to use less than 10 to avoid specificity issues.', this);
      }
    });
  },

});

CSSLint.addRule({
  id:       'known-properties',
  name:     'Require use of known properties',
  desc:     'Properties should be known (listed in CSS3 specification) or be a vendor-prefixed property.',
  url:      'https://github.com/CSSLint/csslint/wiki/Require-use-of-known-properties',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('property', event => {
      if (event.invalid) {
        reporter.report(event.invalid.message, event.line, event.col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'order-alphabetical',
  name:     'Alphabetical order',
  desc:     'Assure properties are in alphabetical order',
  browsers: 'All',

  init(parser, reporter) {
    let properties;
    let started = 0;

    const startRule = () => {
      started = 1;
      properties = [];
    };

    const property = event => {
      if (!started) return;
      const name = event.property.text;
      const lowerCasePrefixLessName = name.toLowerCase().replace(/^-.*?-/, '');
      properties.push(lowerCasePrefixLessName);
    };

    const endRule = event => {
      started = 0;
      if (properties.join(',') !== properties.sort().join(',')) {
        reporter.report("Rule doesn't have all its properties in alphabetical order.", event.line, event.col, this);
      }
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, property);
  },
});

CSSLint.addRule({
  id:       'outline-none',
  name:     'Disallow outline: none',
  desc:     'Use of outline: none or outline: 0 should be limited to :focus rules.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-outline%3Anone',
  browsers: 'All',
  tags:     ['Accessibility'],

  init(parser, reporter) {
    let lastRule;

    const startRule = event => {
      lastRule = !event.selectors ? null : {
        line:      event.line,
        col:       event.col,
        selectors: event.selectors,
        propCount: 0,
        outline:   false,
      };
    };

    const property = event => {
      if (!lastRule) return;
      const name = event.property.text.toLowerCase();
      const value = event.value;
      lastRule.propCount++;
      if (name === 'outline' && /^(none|0)$/i.test(value)) {
        lastRule.outline = true;
      }
    };

    const endRule = () => {
      const {outline, selectors, propCount, line, col} = lastRule || {};
      lastRule = null;
      if (!outline) return;
      if (selectors.toString().toLowerCase().indexOf(':focus') === -1) {
        reporter.report('Outlines should only be modified using :focus.', line, col, this);
      } else if (propCount === 1) {
        reporter.report("Outlines shouldn't be hidden unless other visual changes are made.",
          line, col, this);
      }
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, property);
  },
});

CSSLint.addRule({
  id:       'overqualified-elements',
  name:     'Disallow overqualified elements',
  desc:     "Don't use classes or IDs with elements (a.foo or a#foo).",
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-overqualified-elements',
  browsers: 'All',

  init(parser, reporter) {
    const classes = {};

    parser.addListener('startrule', event => {
      for (const selector of event.selectors) {
        for (const part of selector.parts) {
          if (part.type !== parser.SELECTOR_PART_TYPE) continue;
          for (const mod of part.modifiers) {
            if (part.elementName && mod.type === 'id') {
              reporter.report('Element (' + part + ') is overqualified, just use ' + mod +
                              ' without element name.', part.line, part.col, this);
            } else if (mod.type === 'class') {
              let classMods = classes[mod];
              if (!classMods) classMods = classes[mod] = [];
              classMods.push({modifier: mod, part});
            }
          }
        }
      }
    });

    // one use means that this is overqualified
    parser.addListener('endstylesheet', () => {
      for (const prop in classes) {
        const {part, modifier} = classes[prop][0];
        if (part.elementName && classes[prop].length === 1) {
          reporter.report(`Element (${part}) is overqualified, just use ${modifier} without element name.`,
            part.line, part.col, this);
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'qualified-headings',
  name:     'Disallow qualified headings',
  desc:     'Headings should not be qualified (namespaced).',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-qualified-headings',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const selector of event.selectors) {
        let first = true;
        for (const part of selector.parts) {
          const name = part.elementName;
          if (!first &&
              name &&
              part.type === parser.SELECTOR_PART_TYPE &&
              /h[1-6]/.test(name.toString())) {
            reporter.report(`Heading (${name}) should not be qualified.`,
              part.line, part.col, this);
          }
          first = false;
        }
      }
    });
  },

});

CSSLint.addRule({
  id:       'regex-selectors',
  name:     'Disallow selectors that look like regexs',
  desc:     'Selectors that look like regular expressions are slow and should be avoided.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-selectors-that-look-like-regular-expressions',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const selector of event.selectors) {
        for (const part of selector.parts) {
          if (part.type !== parser.SELECTOR_PART_TYPE) continue;
          for (const mod of part.modifiers) {
            if (mod.type !== 'attribute' || !/([~|^$*]=)/.test(mod)) continue;
            reporter.report(`Attribute selectors with ${RegExp.$1} are slow!`,
              mod.line, mod.col, this);
          }
        }
      }
    });
  },

});

CSSLint.addRule({
  id:       'rules-count',
  name:     'Rules Count',
  desc:     'Track how many rules there are.',
  browsers: 'All',

  init(parser, reporter) {
    let count = 0;
    parser.addListener('startrule', () => count++);
    parser.addListener('endstylesheet', () => reporter.stat('rule-count', count));
  },
});

CSSLint.addRule({
  id:       'selector-max-approaching',
  name:     'Warn when approaching the 4095 selector limit for IE',
  desc:     'Will warn when selector count is >= 3800 selectors.',
  browsers: 'IE',

  init(parser, reporter) {
    let count = 0;
    parser.addListener('startrule', event => (count += event.selectors.length));
    parser.addListener('endstylesheet', () => {
      if (count >= 3800) {
        reporter.report(
          `You have ${count} selectors. ` +
          'Internet Explorer supports a maximum of 4095 selectors per stylesheet. ' +
          'Consider refactoring.', 0, 0, this);
      }
    });
  },

});

CSSLint.addRule({
  id:       'selector-max',
  name:     'Error when past the 4095 selector limit for IE',
  desc:     'Will error when selector count is > 4095.',
  browsers: 'IE',

  init(parser, reporter) {
    let count = 0;
    parser.addListener('startrule', event => (count += event.selectors.length));
    parser.addListener('endstylesheet', () => {
      if (count > 4095) {
        reporter.report(
          `You have ${count} selectors. ` +
          'Internet Explorer supports a maximum of 4095 selectors per stylesheet. ' +
          'Consider refactoring.', 0, 0, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'selector-newline',
  name:     'Disallow new-line characters in selectors',
  desc:     'New-line characters in selectors are usually a forgotten comma and not a descendant combinator.',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const {parts} of event.selectors) {
        for (let p = 0, pLen = parts.length; p < pLen; p++) {
          for (let n = p + 1; n < pLen; n++) {
            if (parts[p].type === 'descendant' &&
                parts[n].line > parts[p].line) {
              reporter.report('newline character found in selector (forgot a comma?)',
                parts[p].line, parts[0].col, this);
            }
          }
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'shorthand',
  name:     'Require shorthand properties',
  desc:     'Use shorthand properties where possible.',
  url:      'https://github.com/CSSLint/csslint/wiki/Require-shorthand-properties',
  browsers: 'All',

  init(parser, reporter) {
    const propertiesToCheck = {};
    const mapping = {
      margin:  ['margin-top', 'margin-bottom', 'margin-left', 'margin-right'],
      padding: ['padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
    };
    let properties;
    let started = 0;

    for (const short in mapping) {
      for (const full of mapping[short]) {
        propertiesToCheck[full] = short;
      }
    }

    const startRule = () => {
      started = 1;
      properties = {};
    };

    const property = event => {
      if (!started) return;
      const name = event.property.toString().toLowerCase();
      if (name in propertiesToCheck) {
        properties[name] = 1;
      }
    };

    const endRule = event => {
      started = 0;
      for (const short in mapping) {
        const fullList = mapping[short];
        const total = fullList.reduce((sum = 0, name) => sum + (properties[name] ? 1 : 0));
        if (total === fullList.length) {
          reporter.report(`The properties ${fullList.join(', ')} can be replaced by ${short}.`,
            event.line, event.col, this);
        }
      }
    };

    parser.addListener('startrule', startRule);
    parser.addListener('startfontface', startRule);
    parser.addListener('property', property);
    parser.addListener('endrule', endRule);
    parser.addListener('endfontface', endRule);
  },
});

CSSLint.addRule({
  id:       'star-property-hack',
  name:     'Disallow properties with a star prefix',
  desc:     'Checks for the star property hack (targets IE6/7)',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-star-hack',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('property', ({property: {hack, line, col}}) => {
      if (hack === '*') {
        reporter.report('Property with star prefix found.', line, col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'text-indent',
  name:     'Disallow negative text-indent',
  desc:     'Checks for text indent less than -99px',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-negative-text-indent',
  browsers: 'All',

  init(parser, reporter) {
    let textIndent, direction;

    const startRule = () => {
      textIndent = false;
      direction = 'inherit';
    };

    const endRule = () => {
      if (textIndent && direction !== 'ltr') {
        reporter.report(
          "Negative text-indent doesn't work well with RTL. " +
          'If you use text-indent for image replacement explicitly set direction for that item to ltr.',
          textIndent.line, textIndent.col, this);
      }
    };

    parser.addListener('startrule', startRule);
    parser.addListener('startfontface', startRule);

    parser.addListener('property', event => {
      const name = event.property.toString().toLowerCase();
      const value = event.value;

      if (name === 'text-indent' && value.parts[0].value < -99) {
        textIndent = event.property;
      } else if (name === 'direction' && value.toString().toLowerCase() === 'ltr') {
        direction = 'ltr';
      }
    });

    parser.addListener('endrule', endRule);
    parser.addListener('endfontface', endRule);
  },
});

CSSLint.addRule({
  id:       'underscore-property-hack',
  name:     'Disallow properties with an underscore prefix',
  desc:     'Checks for the underscore property hack (targets IE6)',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-underscore-hack',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('property', ({property: {hack, line, col}}) => {
      if (hack === '_') {
        reporter.report('Property with underscore prefix found.', line, col, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'unique-headings',
  name:     'Headings should only be defined once',
  desc:     'Headings should be defined only once.',
  url:      'https://github.com/CSSLint/csslint/wiki/Headings-should-only-be-defined-once',
  browsers: 'All',

  init(parser, reporter) {
    const headings = new Array(6).fill(0);

    parser.addListener('startrule', event => {
      for (const {parts} of event.selectors) {
        const part = parts[parts.length - 1];
        if (!part.elementName || !/h([1-6])/i.test(part.elementName)) continue;
        if (part.modifiers.some(mod => mod.type === 'pseudo')) continue;
        if (++headings[Number(RegExp.$1) - 1] > 1) {
          reporter.report(`Heading (${part.elementName}) has already been defined.`,
            part.line, part.col, this);
        }
      }
    });

    parser.addListener('endstylesheet', () => {
      const messages = headings
        .filter(h => h > 1)
        .map((h, i) => `${h} H${i + 1}s`);
      if (messages.length) {
        reporter.rollupWarn(`You have ${messages.join(', ')} defined in this stylesheet.`, this);
      }
    });
  },
});

CSSLint.addRule({
  id:       'universal-selector',
  name:     'Disallow universal selector',
  desc:     'The universal selector (*) is known to be slow.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-universal-selector',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const {parts} of event.selectors) {
        const part = parts[parts.length - 1];
        if (part.elementName === '*') {
          reporter.report(this.desc, part.line, part.col, this);
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'unqualified-attributes',
  name:     'Disallow unqualified attribute selectors',
  desc:     'Unqualified attribute selectors are known to be slow.',
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-unqualified-attribute-selectors',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('startrule', event => {
      for (const {parts} of event.selectors) {
        const part = parts[parts.length - 1];
        if (part.type !== parser.SELECTOR_PART_TYPE) continue;
        if (part.modifiers.some(mod => mod.type === 'class' || mod.type === 'id')) continue;

        const isUnqualified = !part.elementName || part.elementName === '*';
        for (const mod of part.modifiers) {
          if (mod.type === 'attribute' && isUnqualified) {
            reporter.report(this.desc, part.line, part.col, this);
          }
        }
      }
    });
  },
});

CSSLint.addRule({
  id:       'vendor-prefix',
  name:     'Require standard property with vendor prefix',
  desc:     'When using a vendor-prefixed property, make sure to include the standard one.',
  url:      'https://github.com/CSSLint/csslint/wiki/Require-standard-property-with-vendor-prefix',
  browsers: 'All',

  init(parser, reporter) {
    const propertiesToCheck = {
      '-webkit-border-radius':              'border-radius',
      '-webkit-border-top-left-radius':     'border-top-left-radius',
      '-webkit-border-top-right-radius':    'border-top-right-radius',
      '-webkit-border-bottom-left-radius':  'border-bottom-left-radius',
      '-webkit-border-bottom-right-radius': 'border-bottom-right-radius',

      '-o-border-radius':              'border-radius',
      '-o-border-top-left-radius':     'border-top-left-radius',
      '-o-border-top-right-radius':    'border-top-right-radius',
      '-o-border-bottom-left-radius':  'border-bottom-left-radius',
      '-o-border-bottom-right-radius': 'border-bottom-right-radius',

      '-moz-border-radius':             'border-radius',
      '-moz-border-radius-topleft':     'border-top-left-radius',
      '-moz-border-radius-topright':    'border-top-right-radius',
      '-moz-border-radius-bottomleft':  'border-bottom-left-radius',
      '-moz-border-radius-bottomright': 'border-bottom-right-radius',

      '-moz-column-count':    'column-count',
      '-webkit-column-count': 'column-count',

      '-moz-column-gap':    'column-gap',
      '-webkit-column-gap': 'column-gap',

      '-moz-column-rule':    'column-rule',
      '-webkit-column-rule': 'column-rule',

      '-moz-column-rule-style':    'column-rule-style',
      '-webkit-column-rule-style': 'column-rule-style',

      '-moz-column-rule-color':    'column-rule-color',
      '-webkit-column-rule-color': 'column-rule-color',

      '-moz-column-rule-width':    'column-rule-width',
      '-webkit-column-rule-width': 'column-rule-width',

      '-moz-column-width':    'column-width',
      '-webkit-column-width': 'column-width',

      '-webkit-column-span': 'column-span',
      '-webkit-columns':     'columns',

      '-moz-box-shadow':    'box-shadow',
      '-webkit-box-shadow': 'box-shadow',

      '-moz-transform':    'transform',
      '-webkit-transform': 'transform',
      '-o-transform':      'transform',
      '-ms-transform':     'transform',

      '-moz-transform-origin':    'transform-origin',
      '-webkit-transform-origin': 'transform-origin',
      '-o-transform-origin':      'transform-origin',
      '-ms-transform-origin':     'transform-origin',

      '-moz-box-sizing':    'box-sizing',
      '-webkit-box-sizing': 'box-sizing',
    };
    let properties, num, started;

    const startRule = () => {
      started = 1;
      properties = {};
      num = 1;
    };

    const endRule = () => {
      started = 0;
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
        const {line, col} = properties[actual][0].name;
        if (!properties[needed]) {
          reporter.report(`Missing standard property '${needed}' to go along with '${actual}'.`,
            line, col, this);
        } else if (properties[needed][0].pos < properties[actual][0].pos) {
          reporter.report(`Standard property '${needed}' should come after vendor-prefixed property '${actual}'.`,
            line, col, this);
        }
      }
    };

    CSSLint.Util.registerBlockEvents(parser, startRule, endRule, event => {
      if (!started) return;
      const name = event.property.text.toLowerCase();
      let prop = properties[name];
      if (!prop) prop = properties[name] = [];
      prop.push({
        name:  event.property,
        value: event.value,
        pos:   num++,
      });
    });
  },
});

CSSLint.addRule({
  id:       'zero-units',
  name:     'Disallow units for 0 values',
  desc:     "You don't need to specify units when a value is 0.",
  url:      'https://github.com/CSSLint/csslint/wiki/Disallow-units-for-zero-values',
  browsers: 'All',

  init(parser, reporter) {
    parser.addListener('property', event => {
      for (const {units, type, value, line, col} of event.value.parts) {
        if ((units || type === 'percentage') && value === 0 && type !== 'time') {
          reporter.report("Values of 0 shouldn't have units specified.", line, col, this);
        }
      }
    });
  },
});

//endregion
