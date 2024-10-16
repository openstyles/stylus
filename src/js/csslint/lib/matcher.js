import Bucket from './bucket';
import Properties from './properties';
import StringSource from './string-source';
import {clipString} from './util';
import {PropValueIterator} from './validation';
import VTComplex from './validation-complex';
import VTFunctions from './validation-functions';
import VTSimple from './validation-simple';

const rxAltSep = /\s*\|\s*/;
const rxAndAndSep = /\s*&&\s*/y;
const rxBraces = /{\s*(\d+)\s*(?:(,)\s*(?:(\d+)\s*)?)?}/y; // {n,} = {n,Infinity}
const rxFuncBegin = /([-\w]+)\(\s*(\))?/y;
const rxFuncEnd = /\s*\)/y;
const rxGroupBegin = /\[\s*/y;
const rxGroupEnd = /\s*]/y;
const rxOrOrSep = /\s*\|\|\s*/y;
const rxOrSep = /\s*\|(?!\|)\s*/y;
const rxPlainTextAlt = /[-\w]+(?:\s*\|\s*[-\w]+)*(?=\s*\|(?!\|)\s*|\s*]|\s+\)|\s*$)/y;
const rxSeqSep = /\s+(?![&|)\]])/y;
const rxTerm = /<[^>\s]+>|"[^"]*"|'[^']*'|[^\s?*+#{}()[\]|&]+/y;

/**
 * This class implements a combinator library for matcher functions.
 * https://developer.mozilla.org/docs/Web/CSS/Value_definition_syntax#Component_value_combinators
 */
export default class Matcher {
  /**
   * @param {(this: Matcher, expr: PropValueIterator, p?: Token) => boolean} matchFunc
   * @param {string|function} toString
   * @param {?} [arg]
   * @param {boolean} [isMeta] - true for alt/seq/many/braces that control matchers
   */
  constructor(matchFunc, toString, arg, isMeta) {
    this.matchFunc = matchFunc;
    if (arg != null) this.arg = arg;
    if (isMeta) this.isMeta = isMeta;
    if (toString.call) this.toString = toString; else this._string = toString;
  }

  /**
   * @param {PropValueIterator} expr
   * @param {Token} [p]
   * @return {boolean}
   */
  match(expr, p) {
    const {i} = expr;
    if (!p && !(p = expr.parts[i])) return this.arg.min === 0;
    const isMeta = this.isMeta;
    const res = !isMeta && p.isVar ||
      this.matchFunc(expr, p) ||
      !isMeta && expr.tryAttr && p.isAttr;
    if (!res) {
      expr.i = i;
    } else if (!isMeta && expr.i < expr.parts.length) ++expr.i;
    return res;
  }

  toString() {
    return this._string;
  }

  /** Matcher for one or more juxtaposed words, which all must occur, in the given order. */
  static alt(ms) {
    let str; // Merging stringArray hubs
    for (let SAT = Matcher.stringArrTest,
      i = 0; i < ms.length;) {
      if (ms[i].matchFunc === SAT) {
        str = (str ? str + ' | ' : '') + ms[i]._string;
        ms.splice(i, 1);
      } else {
        i++;
      }
    }
    if (str) ms.unshift(Matcher.term(str));
    return !ms[1] ? ms[0] : new Matcher(Matcher.altTest, Matcher.altToStr, ms, true);
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean|void}
   */
  static altTest(expr, p) {
    for (let ms = this.arg,
      i = 0; i < ms.length; i++) {
      if (ms[i].match(expr, p)) return true;
    }
  }

  /** @this {Matcher} */
  static altToStr(prec) {
    return (prec = prec > Matcher.ALT ? '[ ' : '') +
      this.arg.map(m => m.toString(Matcher.ALT)).join(' | ') +
      (prec ? ' ]' : '');
  }

  braces(min, max, marker, sep) {
    return new Matcher(Matcher.bracesTest, Matcher.bracesToStr, {
      m: this,
      min, max, marker,
      sep: sep && Matcher.seq([sep.matchFunc ? sep : Matcher.term(sep), this]),
    }, true);
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean|number}
   */
  static bracesTest(expr, p) {
    let i = 0;
    const {min, max, sep, m} = this.arg;
    while (i < max && (i && sep || m).match(expr, p)) {
      p = undefined; // clearing because expr points to the next part now
      i++;
    }
    return i >= min && (i || true);
  }

  /** @this {Matcher} */
  static bracesToStr() {
    const {marker, min, max, m} = this.arg;
    return m.toString(Matcher.MOD) + (marker || '') + (
      !marker || marker === '#' && !(min === 1 || max === Infinity)
        ? `{${min}${min === max ? '' : `,${max === Infinity ? '' : max}`}}`
        : '');
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean|number|void}
   */
  static funcTest(expr, p) {
    const pn = p.name;
    if (!pn) return;
    const pnv = (p.prefix || '') + pn;
    const {name, body, list} = this.arg;
    const m = list ? list[pn] || list[pnv]
      : name === pn || name === pnv ? (body || '')
        : null;
    if (m == null) return;
    const e = p.expr;
    if (!e && m) return m.arg.min === 0;
    const vi = m && !e.isVar && new PropValueIterator(e);
    const mm = !vi || m.matchFunc ? m :
      list[pn] = (m.call ? m(Matcher) : Matcher.cache[m] || Matcher.parse(m));
    return !vi || mm.match(vi) && vi.i >= vi.parts.length || !(expr.badFunc = [e, mm]);
  }

  /** @this {Matcher} */
  static funcToStr(prec) {
    const {name, body, list} = this.arg;
    return name ? `${name}(${body ? ` ${body} ` : ''})` :
      (prec = prec > Matcher.ALT ? '[ ' : '') +
      Object.keys(list).join('() | ') +
      (prec ? '() ]' : '()');
  }

  static many(req, ms) {
    if (!ms[1]) return ms[0];
    const res = new Matcher(Matcher.manyTest, Matcher.manyToStr, ms, true);
    res.req = req === true ? Array(ms.length).fill(true) :
      req == null ? ms.map(m => !m.arg || m.arg.marker !== '?')
        : req;
    return res;
  }

  /**
   * Matcher for two or more options: double bar (||) and double ampersand (&&) operators,
   * as well as variants of && where some of the alternatives are optional.
   * This will backtrack through even successful matches to try to
   * maximize the number of items matched.
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @return {!boolean}
   */
  static manyTest(expr) {
    const state = [];
    state.expr = expr;
    state.max = 0;
    // If couldn't get a complete match, retrace our steps to make the
    // match with the maximum # of required elements.
    if (!this.manyTestRun(state, 0)) this.manyTestRun(state, 0, true);
    if (!this.req) return state.max > 0;
    // Use finer-grained specification of which matchers are required.
    for (let i = 0; i < this.req.length; i++) {
      if (this.req[i] && !state[i]) return false;
    }
    return true;
  }

  manyTestRun(state, count, retry) {
    for (let i = 0, {expr} = state,
      ms = this.arg,
      ei,
      x; i < ms.length; i++) {
      if (!state[i] && (
        (ei = expr.i) + 1 > expr.parts.length ||
        (x = ms[i].match(expr)) && (x > 1 || x === 1 || ms[i].arg.min !== 0)
        // Seeing only real matches e.g. <foo> inside <foo>? or <foo>* or <foo>#{0,n}
        // Not using `>=` because `true>=1` and we don't want booleans here
      )) {
        state[i] = true;
        if (this.manyTestRun(state, count + (!this.req || this.req[i] ? 1 : 0), retry)) {
          return true;
        }
        state[i] = false;
        expr.i = ei;
      }
    }
    if (retry) return count === state.max;
    state.max = Math.max(state.max, count);
    return count === this.arg.length;
  }

  /** @this {Matcher} */
  static manyToStr(prec) {
    const {req} = this;
    const p = Matcher[req ? 'ANDAND' : 'OROR'];
    const s = this.arg.map((m, i) =>
      !req || req[i]
        ? m.toString(p)
        : m.toString(Matcher.MOD).replace(/[^?]$/, '$&?'),
    ).join(req ? ' && ' : ' || ');
    return prec > p ? `[ ${s} ]` : s;
  }

  /** Simple recursive-descent parseAlt to build matchers from strings. */
  static parse(str) {
    const source = new StringSource(str);
    const res = Matcher.parseAlt(source);
    if (!source.eof()) {
      const {offset: i, string} = source;
      throw new Error(`Internal grammar error. Unexpected "${
        clipString(string.slice(i, 31), 30)}" at position ${i} in "${string}".`);
    }
    Matcher.cache[str] = res;
    return res;
  }

  /**
   * ALT: OROR [ " | " OROR ]*  (exactly one matches)
   * OROR: ANDAND [ " || " ANDAND ]*  (at least one matches in any order)
   * ANDAND: SEQ [ " && " SEQ ]*  (all match in any order)
   * SEQ: TERM [" " TERM]*  (all match in specified order)
   * TERM: [ "<" type ">" | literal | "[ " ALT " ]" | fn "()" | fn "( " ALT " )" ] MOD?
   * MOD: "?" | "*" | "+" | "#" | [ "{" | "#{" ] <num>[,[<num>]?]? "}" ]
   * The specified literal spaces like " | " are optional except " " in SEQ (i.e. \s+)
   * @param {StringSource} src
   * @return {Matcher}
   */
  static parseAlt(src) {
    const alts = [];
    do {
      const pt = src.readMatch(rxPlainTextAlt);
      if (pt) {
        alts.push(Matcher.term(pt));
      } else {
        const ors = [];
        do {
          const ands = [];
          do {
            const seq = [];
            do {
              seq.push(Matcher.parseTerm(src));
            } while (src.readMatch(rxSeqSep));
            ands.push(Matcher.seq(seq));
          } while (src.readMatch(rxAndAndSep));
          ors.push(Matcher.many(null, ands));
        } while (src.readMatch(rxOrOrSep));
        alts.push(Matcher.many(false, ors));
      }
    } while (src.readMatch(rxOrSep));
    return Matcher.alt(alts);
  }

  /**
   * @param {StringSource} src
   * @return {Matcher}
   */
  static parseTerm(src) {
    let m,
      fn;
    if (src.readMatch(rxGroupBegin)) {
      m = Matcher.parseAlt(src);
      if (!src.readMatch(rxGroupEnd)) Matcher.parsingFailed(src, rxGroupEnd);
    } else if ((fn = src.readMatch(rxFuncBegin, true))) {
      m = new Matcher(Matcher.funcTest, Matcher.funcToStr, {
        name: fn[1].toLowerCase(),
        body: !fn[2] && Matcher.parseAlt(src),
      });
      if (!fn[2] && !src.readMatch(rxFuncEnd)) Matcher.parsingFailed(src, rxFuncEnd);
    } else {
      m = Matcher.term(src.readMatch(rxTerm) || Matcher.parsingFailed(src, rxTerm));
    }
    fn = src.peek();
    if (fn === 123/* { */ || fn === 35/* # */ && src.peek(2) === 123) {
      const hash = fn === 35 ? src.read() : '';
      const [, a, comma, b = comma ? Infinity : a] = src.readMatch(rxBraces, true)
      || Matcher.parsingFailed(src, rxBraces);
      return m.braces(+a, +b, hash, hash && ',');
    }
    switch (fn) {
      case 63: /* ? */
        return m.braces(0, 1, src.read());
      case 42: /* * */
        return m.braces(0, Infinity, src.read());
      case 43: /* + */
        return m.braces(1, Infinity, src.read());
      case 35: /* # */
        return m.braces(1, Infinity, src.read(), ',');
    }
    return m;
  }

  /**
   * @param {StringSource} src
   * @param {RegExp|string} m
   * @throws
   */
  static parsingFailed(src, m) {
    throw new Error('Internal grammar error. ' +
      `Expected ${m} at ${src.offset} in ${src.string}`);
  }

  static seq(ms) {
    return !ms[1] ? ms[0] : new Matcher(Matcher.seqTest, Matcher.seqToStr, ms, true);
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean|void}
   */
  static seqTest(expr, p) {
    let min1,
      i,
      m,
      res;
    for (i = 0; (m = this.arg[i++]); p = undefined) {
      if (!(res = m.match(expr, p))) return;
      if (!min1 && (m.arg.min !== 0 || res === 1 || res > 1)) min1 = true;
      // a number >= 1 is returned only from bracesTest
    }
    return true;
  }

  /** @this {Matcher} */
  static seqToStr(prec) {
    return (prec = prec > Matcher.SEQ ? '[ ' : '') +
      this.arg.map(m => m.toString(Matcher.SEQ)).join(' ') +
      (prec ? ' ]' : '');
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean}
   */
  static simpleTest(expr, p) {
    return !!this.arg(p);
  }

  /**
   * @this {Matcher}
   * @param {PropValueIterator} expr
   * @param {Token} p
   * @return {!boolean|void}
   */
  static stringArrTest(expr, p) {
    // If the bucket has -vendor-prefixed-text we will use the token as-is without unprefixing it
    return this.arg.has(p) || p.vendorCode &&
      (expr = this.arg[p.vendorCode * 100 + p.length - p.vendorPos]) &&
      (p = p.text.slice(p.vendorPos).toLowerCase()) &&
      (typeof expr === 'string' ? expr === p : expr.includes(p));
  }

  /** @this {Matcher} */
  static stringArrToStr(prec) {
    return (prec = prec > Matcher.ALT && this._string.includes(' ') ? '[ ' : '') +
      this._string + (prec ? ' ]' : '');
  }

  /** Matcher for a single type */
  static term(str) {
    const origStr = str;
    let m = Matcher.cache[str = str.toLowerCase()];
    if (m) return m;
    if (str[0] !== '<') {
      m = new Matcher(Matcher.stringArrTest, Matcher.stringArrToStr,
        new Bucket(str.split(rxAltSep)));
      m._string = str;
    } else if (str.startsWith('<fn:')) {
      m = new Matcher(Matcher.funcTest, Matcher.funcToStr,
        {list: VTFunctions[origStr.slice(4, -1)]});
    } else if ((m = VTSimple[str])) {
      m = new Matcher(Matcher.simpleTest, str, m);
    } else {
      m = VTComplex[str] || Properties[str.slice(1, -1)];
      m = m.matchFunc ? m : m.call ? m(Matcher) : Matcher.cache[m] || Matcher.parse(m);
      if (str === '<url>') {
        m._string = str;
        delete m.toString;
      }
    }
    Matcher.cache[str] = m;
    return m;
  }
}

/** @type {{[key:string]: Matcher}} */
Matcher.cache = {__proto__: null};
// Precedence of combinators.
Matcher.MOD = 5;
Matcher.SEQ = 4;
Matcher.ANDAND = 3;
Matcher.OROR = 2;
Matcher.ALT = 1;
