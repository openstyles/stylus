export let shorthands, shorthandsFor;

/** Gets the lower-cased text without vendor prefix */
export function getPropName(prop) {
  const low = prop.lowText ??= prop.text.toLowerCase();
  const vp = prop.vendorPos;
  return vp ? low.slice(vp) : low;
}

export function registerRuleEvents(parser, {start, property, end}) {
  for (const e of [
    'container',
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
}

export function registerShorthandEvents(parser, {property, end}) {
  const stack = [];
  let props;
  registerRuleEvents(parser, {
    start() {
      stack.push(props);
      props = null;
    },
    property(event) {
      if (!stack.length || event.inParens) return;
      const name = getPropName(event.property);
      const sh = (shorthandsFor || makeShorthandsFor())[name];
      if (sh) {
        if (!props) props = {};
        (props[sh] || (props[sh] = {}))[name] = event;
      } else if (property && props && name in shorthands) {
        property(event, props, name);
      }
    },
    end(event) {
      if (end && props) {
        if (!shorthands) makeShorthands();
        end(event, props);
      }
      props = stack.pop();
    },
  });
}

export function makeShorthands() {
  shorthands = Object.create(null);
  shorthandsFor = Object.create(null);
  const WSC = 'width|style|color';
  const TBLR = 'top|bottom|left|right';
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
  return shorthands;
}

export function makeShorthandsFor() {
  return makeShorthands() && shorthandsFor;
}

export class Reporter {
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
