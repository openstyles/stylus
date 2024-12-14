import {IDENT, UVAR, WS} from './tokens';
import {assign, define, isOwn, parseString, PDESC, toLowAscii} from './util';

/**
 * @property {[]} [args] added in selectors
 * @property {string} [atName] lowercase name of @-rule without -vendor- prefix
 * @property {TokenValue} [expr] body of function or block
 * @property {boolean} [ie] ie function
 * @property {boolean} [is0] number is an integer 0 without units
 * @property {boolean} [isAttr] = attr()
 * @property {boolean} [isCalc] = calc()
 * @property {boolean} [isInt] = integer without units
 * @property {boolean} [isNone] = none
 * @property {boolean} [isVar] = var(), env(), /*[[var]]* /
 * @property {'*'|'_'} [hack] for property name in IE mode
 * @property {string} [lowText] text.toLowerCase() added on demand
 * @property {string} [name] name of function
 * @property {number} [number] parsed number
 * @property {string} [prefix] lowercase `-vendor-` prefix
 * @property {string} [units] lowercase units of a number
 * @property {string} [uri] parsed uri string
 * @property {number} [vendorCode] char code of vendor name i.e. 102 for "f" in -moz-foo
 * @property {number} [vendorPos] position of vendor name i.e. 5 for "f" in -moz-foo
 */
export default class Token {
  constructor(id, col, line, offset, input, code) {
    this.id = id;
    this.col = col;
    this.line = line;
    this.offset = offset;
    this.offset2 = offset + 1;
    this.type = '';
    this.code = toLowAscii(code);
    this._input = input;
  }

  /** @return {Token} */
  static from(tok) {
    return assign(Object.create(this.prototype), tok);
  }

  get length() {
    return isOwn(this, 'text') ? this.text.length : this.offset2 - this.offset;
  }

  get string() {
    const str = PDESC.value = parseString(this.text);
    define(this, 'string', PDESC);
    return str;
  }

  set string(val) {
    PDESC.value = val;
    define(this, 'string', PDESC);
  }

  get text() {
    return this._input.slice(this.offset, this.offset2);
  }

  set text(val) {
    PDESC.value = val;
    define(this, 'text', PDESC);
  }

  valueOf() {
    return this.text;
  }

  toString() {
    return this.text;
  }
}

export class TokenFunc extends Token {
  /** @return {TokenFunc} */
  static from(tok, expr, end) {
    tok = super.from(tok);
    tok.type = 'fn';
    if (isOwn(tok, 'text')) tok.offsetBody = tok.offset2;
    if (end) tok.offset2 = end.offset2;
    if (expr) {
      tok.expr = expr;
      let n = tok.name; // these functions are valid only if not empty
      if (n === 'calc' || n === 'clamp' || n === 'min' || n === 'max' ||
          n === 'sin' || n === 'cos' || n === 'tan' || n === 'asin' ||
          n === 'acos' || n === 'atan' || n === 'atan2') {
        tok.isCalc = true;
      } else if (n === 'var' || n === 'env') {
        tok.isVar = true;
      } else if (n === 'attr' && (n = expr.parts[0]) && (n.id === IDENT || n.id === UVAR)) {
        tok.isAttr = true;
      }
    }
    return tok;
  }

  toString() { // FIXME: account for escapes
    const s = this._input;
    return isOwn(this, 'text')
      ? this.text + s.slice(this.offsetBody + 1, this.offset2)
      : s.slice(this.offset, this.offset2);
  }
}

/**
 * @template T
 * @prop {T[]} parts
 */
export class TokenValue extends Token {
  /** @return {TokenValue} */
  static from(parts, tok = parts[0]) {
    tok = super.from(tok);
    tok.parts = parts;
    return tok;
  }

  /** @return {TokenValue} */
  static empty(tok) {
    tok = super.from(tok);
    tok.parts = [];
    tok.id = WS;
    tok.offset2 = tok.offset;
    delete tok.text;
    return tok;
  }

  get text() { // FIXME: account for escapes
    return this._input.slice(this.offset, (this.parts[this.parts.length - 1] || this).offset2);
  }

  set text(val) {
    PDESC.value = val;
    define(this, 'text', PDESC);
  }
}
