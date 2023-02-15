'use strict';
/* eslint-disable class-methods-use-this */

(() => {
  //#region Types

  const parserlib = typeof self !== 'undefined'
    ? (require('/js/csslint/parserlib-base'), self.parserlib)
    : require('./parserlib-base');
  const {assign, defineProperty: define} = Object;
  const isOwn = Object.call.bind({}.hasOwnProperty);
  const {
    css: {
      Combinators,
      NamedColors,
      TokenTypeByCode,
      TokenTypeByText,
      Tokens,
      Units,
    },
    util: {
      Bucket,
      EventTarget,
      StringReader,
      UnitTypeIds,
      clipString,
      validateProperty,
    },
  } = parserlib;
  const {
    AMP, CHAR, COLON, COMMA, COMMENT, DELIM, DOT, HASH, FUNCTION,
    IDENT, LBRACE, LBRACKET, LPAREN, MINUS, NTH, NUMBER, PCT, PIPE, PLUS,
    RBRACE, RBRACKET, RPAREN, S: WS, SEMICOLON, STAR, USO_VAR,
  } = Tokens;
  const TT = {
    attrEq: [Tokens.ATTR_EQ, Tokens.EQUALS],
    attrEqEnd: [Tokens.ATTR_EQ, Tokens.EQUALS, RBRACKET],
    attrStart: [PIPE, IDENT, STAR],
    attrNameEnd: [RBRACKET, USO_VAR, WS],
    combinator: [PLUS, Tokens.COMBINATOR],
    cruft: [Tokens.CDO, Tokens.CDC],
    declEnd: [SEMICOLON, RBRACE],
    docFunc: [FUNCTION, IDENT/* while typing a new func */, Tokens.URI],
    identStar: [IDENT, STAR],
    identString: [IDENT, Tokens.STRING, USO_VAR],
    mediaValue: [IDENT, NUMBER, Tokens.DIMENSION, Tokens.LENGTH],
    mediaList: [IDENT, LPAREN],
    nthOf: [IDENT, NUMBER, PLUS, NTH],
    nthOfEnd: [IDENT, RPAREN],
    propCustomEnd: [DELIM, SEMICOLON, RBRACE, RBRACKET, RPAREN, Tokens.INVALID],
    propValEnd: [DELIM, SEMICOLON, RBRACE],
    propValEndParen: [DELIM, SEMICOLON, RBRACE, RPAREN],
    pseudo: [FUNCTION, IDENT],
    selectorStart: [AMP, PIPE, IDENT, STAR, HASH, DOT, LBRACKET, COLON],
    supportsIdentNext: [COLON, LPAREN],
    supportsInParens: [FUNCTION, IDENT, LPAREN],
    stringUri: [Tokens.STRING, Tokens.URI, USO_VAR],
  };
  const B = /** @type {{[key:string]: Bucket}} */ {
    attrIS: ['i', 's', ']'], // "]" is to improve the error message,
    colors: NamedColors,
    plusMinus: ['+', '-'],
  };
  const PAIRING = [];
  const PDESC = {configurable: true, enumerable: true, writable: true, value: null};
  /** For these tokens stream.match() will return a USO_VAR unless the next token is a direct match */
  const USO_VAR_PROXY = [PCT, ...TT.mediaValue, ...TT.identString]
    .reduce((res, id) => (res[id] = true) && res, []);
  // Sticky `y` flag must be used in expressions for reader.readMatch
  const rxComment = /\*([^*]+|\*(?!\/))*(\*\/|$)/y; // the opening "/" is already consumed
  const rxCommentUso = /\*\[\[[-\w]+]]\*\/|\*(?:[^*]+|\*(?!\/))*(\*\/|$)/y;
  const rxDigits = /\d+/y;
  const rxMaybeQuote = /\s*['"]?/y;
  const rxName = /(?:[-_\da-zA-Z\u00A0-\uFFFF]+|\\(?:(?:[0-9a-fA-F]{1,6}|.)[\t ]?|$))+/y;
  const rxNth = /(even|odd)|(?:([-+]?\d*n)(?:\s*([-+])(\s*\d+)?)?|[-+]?\d+)((?=\s+of\s+|\s*\)))?/yi;
  const rxNumberDigit = /\d*\.?\d*(e[+-]?\d+)?/iy;
  const rxNumberDot = /\d+(e[+-]?\d+)?/iy;
  const rxNumberSign = /(\d*\.\d+|\d+\.?\d*)(e[+-]?\d+)?/iy;
  const rxSign = /[-+]/y;
  const rxSpace = /\s+/y;
  const rxSpaceCmtRParen = /(?=\s|\/\*|\))/y;
  const rxSpaceComments = /(?:\s+|\/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$))+/y;
  const rxSpaceRParen = /\s*\)/y;
  const rxStringDoubleQ = /(?:[^\n\\"]+|\\(?:([0-9a-fA-F]{1,6}|.)[\t ]?|\n|$))*/y;
  const rxStringSingleQ = /(?:[^\n\\']+|\\(?:([0-9a-fA-F]{1,6}|.)[\t ]?|\n|$))*/y;
  const rxUnescapeLF = /\\(?:(?:([0-9a-fA-F]{1,6})|(.))[\t ]?|(\n))/g;
  const rxUnescapeNoLF = /\\(?:([0-9a-fA-F]{1,6})|(.))[\t ]?/g;
  const rxUnquotedUrl = /(?:[-!#$%&*-[\]-~\u00A0-\uFFFF]+|\\(?:(?:[0-9a-fA-F]{1,6}|.)[\t ]?|$))+/y;
  const [rxDeclBlock, rxDeclValue] = ((
    common = `(${rxUnescapeLF.source}|` + String.raw`\([^'"{}()[\]\\]*\)|\[[^'"{}()[\]\\]*]` +
    `|/${rxComment.source}|"${rxStringDoubleQ.source}"|'${rxStringSingleQ.source}'|`
  ) => [
    String.raw`\{[^'"{}()[\]\\]*}|[^`,
    '[^;',
  ].map(str => RegExp(common + str + String.raw`'"{}()[\]\\/]|/(?!\*))+`, 'y')))();
  const isIdentStart = c => c >= 97 && c <= 122 || c >= 65 && c <= 90 || // a-z A-Z
    c === 45 || c === 92 || c === 95 || c >= 160; // - \ _
  const isIdentChar = (c, prev) => c >= 97 && c <= 122 || c >= 65 && c <= 90 /* a-z A-Z */ ||
    c === 45 || c === 92 || c === 95 || c >= 160 || c >= 48 && c <= 57 /* - \ _ 0-9 */ ||
    prev === 92 /* \ */ && c !== 10 && c != null;
  const isSpace = c => c === 9 && c === 10 || c === 32;
  const toLowAscii = c => c >= 65 && c <= 90 ? c + 32 : c;
  const unescapeNoLF = (m, code, char) => char || String.fromCodePoint(parseInt(code, 16));
  const unescapeLF = (m, code, char, LF) => LF ? '' : char ||
    String.fromCodePoint(parseInt(code, 16));
  const parseString = str => str.slice(1, -1).replace(rxUnescapeLF, unescapeLF);
  /**
   * @property {boolean} isUvp
   * @typedef {true[]} TokenMap - index is a token id
   */
  for (const k in TT) {
    TT[k] = TT[k].reduce((res, id) => {
      if (USO_VAR_PROXY[id]) res.isUvp = 1;
      res[id] = true;
      return res;
    }, []);
  }
  for (const k in B) B[k] = new Bucket(B[k]);
  // Splitting into words by an Uppercase letter
  for (const k of 'and,andOr,auto,evenOdd,fromTo,important,layer,n,none,not,onlyNot,of,or'
    .split(',')) B[k] = new Bucket(k.split(/(?=[A-Z])/).map(s => s.toLowerCase()));
  PAIRING[LBRACE] = RBRACE;
  PAIRING[LBRACKET] = RBRACKET;
  PAIRING[LPAREN] = RPAREN;

  //#endregion
  //#region Syntax units

  /**
   * @property {boolean} [ie] ie function
   * @property {boolean} [is0] number is an integer 0 without units
   * @property {boolean} [isInt] number part is integer
   * @property {boolean} [isAttr] = attr()
   * @property {boolean} [isAuto] = auto
   * @property {boolean} [isCalc] = calc()
   * @property {boolean} [isNone] = none
   * @property {boolean} [isVar] = var(), env(), /*[[var]]* /
   * @property {TokenValue} [expr] body of function or block
   * @property {string} [lowText] text.toLowerCase() added on demand
   * @property {string} [name] name of function
   * @property {number} [number] parsed number
   * @property {string} [uri] parsed uri string
   * @property {number} [vendorCode] char code of vendor name i.e. 102 for "f" in -moz-foo
   * @property {number} [vendorPos] position of vendor name i.e. 5 for "f" in -moz-foo
   */
  class Token {
    constructor(id, col, line, offset, offset2, input, code) {
      this.id = id;
      this.col = col;
      this.line = line;
      this.offset = offset;
      this.offset2 = offset2;
      this.type = '';
      this.lowCode = toLowAscii(code);
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

  class TokenFunc extends Token {
    /** @return {TokenFunc} */
    static from(tok, expr, end) {
      tok = super.from(tok);
      tok.type = 'fn';
      if (isOwn(tok, 'text')) tok.offsetBody = tok.offset2;
      if (end) tok.offset2 = end.offset2;
      if (expr) {
        tok.expr = expr;
        let n = tok.name; // these functions are valid only if not empty
        if (n === 'calc' || n === 'clamp' || n === 'min' || n === 'max') {
          tok.isCalc = true;
        } else if (n === 'var' || n === 'env') {
          tok.isVar = true;
        } else if (n === 'attr' && (n = expr.parts[0]) && (n.id === IDENT || n.id === USO_VAR)) {
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

  class TokenValue extends Token {
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
      tok.id = Tokens.UNKNOWN;
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

  class MediaQuery extends Token {
    /** @return {MediaQuery} */
    static from(tok, modifier, mediaType, features) {
      tok = super.from(tok);
      tok.type = mediaType;
      tok.modifier = modifier;
      tok.features = features;
      return tok;
    }
    get text() {
      const mod = this.modifier || '';
      const feats = this.features.join(' and ');
      const val = `${mod}${mod ? ' ' : ''}${this.type || ''}${feats ? ' and ' : ''}${feats}`;
      PDESC.value = val;
      define(this, 'text', PDESC);
      return val;
    }
    set text(val) {
      PDESC.value = val;
      define(this, 'text', PDESC);
    }
  }

  class SyntaxError extends Error {
    constructor(message, pos) {
      super();
      this.name = this.constructor.name;
      this.col = pos.col;
      this.line = pos.line;
      this.offset = pos.offset;
      this.message = message;
    }
  }

  //#endregion
  //#region TokenStream

  const LT_SIZE = 4;

  class TokenStream {

    constructor(input) {
      this.reader = new StringReader(input ? `${input}` : '');
      this._amp = 0;
      this._esc = false;
      this._resetLT();
    }

    _resetLT() {
      /** @type {Token} Last consumed token object */
      this.token = null;
      /** Lookahead token buffer */
      this._lt = [];
      /** Current index may change due to unget() */
      this._cur = 0;
      /** Wrapping around the index to avoid splicing/shifting the array */
      this._cycle = 0;
    }

    /**
     * Consumes the next token if that matches any of the given token type(s).
     * @param {number|TokenMap} what - token id or ids
     * @param {{reuse?:boolean}|Bucket|false} [arg]
     * - bucket to match token text, false = {skipWS:false}
     * @return {Token | false | 0} 0 = EOF
     */
    match(what, arg) {
      let tryVar;
      const isArr = typeof what === 'object';
      const text = arg && Array.isArray(arg) && arg;
      const tok = !text && arg && arg.reuse && this.token ||
        this.get(arg === false || what === WS || isArr && what[WS] ? 0
          : tryVar = (isArr ? what.isUvp : USO_VAR_PROXY[what]) && !text ? 1 : 2);
      return (isArr ? what[tok.id] : tok.id === what) && (!text || text.has(tok)) && tok ||
        // Return the next token if it's not a var but a real match
        tryVar && tok.isVar && !(tryVar = this.match(what)).isVar && tryVar ||
        (this.unget(), tok.id ? false : 0);
    }

    /** @return {Token} */
    mustMatch(what, arg) {
      return this.match(what, arg) || this._failure(what, this.peek());
    }

    /**
     * @param {boolean|2} [skip] 2=skipUsoVar
     * @return {Token}
     */
    get(skip) {
      let {_cycle, _cur, _lt} = this;
      let tok, ti;
      do {
        const cached = _cur < _lt.length;
        const slot = (_cur + _cycle) % LT_SIZE;
        tok = cached ? (_cur++, _lt[slot]) : this._getToken();
        ti = tok.id;
        if (!(ti === COMMENT || skip && (ti === WS || ti === USO_VAR && skip === 2))) {
          if (!cached) {
            if (_lt.length < LT_SIZE) _cur++;
            else this._cycle = _cycle = (_cycle + 1) % LT_SIZE;
            _lt[slot] = tok;
          }
          break;
        }
      } while (ti);
      if (ti === AMP) this._amp++;
      this._cur = _cur;
      this.token = tok;
      return tok;
    }

    /** @return {Token} */
    peek() {
      let tok;
      if (this._cur < this._lt.length) {
        tok = this._lt[(this._cur + this._cycle) % LT_SIZE];
      } else {
        const old = this.token;
        tok = this.get();
        if (tok.id === AMP) this._amp--;
        this.token = old;
        this._cur--;
      }
      return tok;
    }

    /** @return {Token} */
    peekCached() {
      return this._cur < this._lt.length && this._lt[(this._cur + this._cycle) % LT_SIZE];
    }

    /** Restores the last consumed token to the token stream. */
    unget() {
      if (this._cur) {
        if ((this.token || {}).id === AMP) this._amp--;
        this.token = this._lt[(--this._cur - 1 + this._cycle + LT_SIZE) % LT_SIZE];
      } else {
        throw new Error('Too much lookahead.');
      }
    }

    _failure(goal = '', tok = this.token, throwIt = true) {
      goal = typeof goal === 'string' ? goal :
        goal instanceof Bucket ? `"${goal.join('", "')}"` :
          (+goal ? [goal] : goal).reduce((res, v, id) => res + (res ? ', ' : '') +
            ((v = Tokens[v === true ? id : v]).text ? `"${v.text}"` : v.name), '');
      goal = goal ? `Expected ${goal} but found` : 'Unexpected';
      goal = new SyntaxError(`${goal} "${clipString(tok)}".`, tok);
      if (throwIt) throw goal;
      return goal;
    }

    /**
     * @returns {Object} token
     */
    _getToken() {
      let a, c, text;
      const {reader} = this;
      const start = reader.offset;
      const tok = new Token(CHAR,
        reader.col,
        reader.line,
        start,
        start + 1,
        reader.string,
        a = reader.readCode());
      const b = reader.peek();
      // [\t\n\x20]
      if (a === 9 || a === 10 || a === 32) {
        tok.id = WS;
        if (isSpace(b)) reader.readMatch(rxSpace);
      // [0-9]
      } else if (a >= 48 && a <= 57) {
      // [0-9.eE] */
        text = this._number(a, (b >= 48 && b <= 57 || b === 46 || b === 69 || b === 101) && b, tok);
      // [-+.]
      } else if ((a === 45 || a === 43 && (tok.id = PLUS) || a === 46 && (tok.id = DOT)) && (
      /* [-+.][0-9] */ b >= 48 && b <= 57 ||
      /* [-+].[0-9] */ a !== 46 && b === 46 && (c = reader.peek(2)) >= 48 && c <= 57
      )) {
        text = this._number(a, b, tok);
      // -
      } else if (a === 45) {
        if (b === 45/* -- */ && isIdentChar(c || (c = reader.peek(2)))) {
          text = this._ident(a, b, 1, c, 1, tok);
          tok.type = 'custom-prop';
        } else if (b === 45 && (c || (c = reader.peek(2))) === 62/* -> */) {
          reader.read(2, '->');
          tok.id = Tokens.CDC;
        } else if (isIdentStart(b)) {
          text = this._ident(a, b, 1, c, undefined, tok);
        } else {
          tok.id = MINUS;
        }
      // U+ u+
      } else if ((a === 85 || a === 117) && b === 43) {
        this._unicodeRange(tok);
      // a-z A-Z - \ _ unicode
      } else if (isIdentStart(a)) {
        text = this._ident(a, b, c, c, c, tok);
      } else if ((c = b === 61 // =
      /* $= *= ^= |= ~= */
        ? (a === 36 || a === 42 || a === 94 || a === 124 || a === 126) &&
          Tokens.ATTR_EQ
      /* || */
        : a === 124 && b === 124 &&
          Tokens.COMBINATOR
      )) {
        tok.id = c;
        reader.readCode();
      // [.,:;>+~=|*{}[]()]
      } else if ((c = TokenTypeByCode[a])) {
        tok.id = c;
      // /*
      } else if (a === 47) {
        if (b === 42) {
          c = reader.readMatch(rxCommentUso, true);
          tok.id = c[1] != null ? COMMENT : (tok.isVar = true, USO_VAR);
        }
      // ["']
      } else if (a === 34 || a === 39) {
        reader.readMatch(a === 34 ? rxStringDoubleQ : rxStringSingleQ);
        if (reader.readMatchCode(a)) {
          tok.id = Tokens.STRING;
          tok.type = 'string';
        } else {
          tok.id = Tokens.INVALID;
        }
      // #
      } else if (a === 35) {
        if (isIdentChar(b)) {
          tok.id = HASH;
          c = this.readChunksWithEscape('', rxName);
          text = this._esc && (String.fromCharCode(a) + c);
        }
      // \
      } else if (a === 92) {
        if (b == null) text = '\uFFFD';
        else if (b === 10) { tok.id = WS; text = reader.readMatch(rxSpace); }
      // @
      } else if (a === 64) {
        if (isIdentStart(b)) {
          c = this.readChunksWithEscape('@', rxName);
          tok.id = TokenTypeByText[c.toLowerCase()] || Tokens.UNKNOWN_SYM;
          text = this._esc && c;
        }
      // <
      } else if (a === 60) {
        if (b === 33/*!*/ && reader.readMatchStr('!--')) {
          tok.id = Tokens.CDO;
        }
      } else if (a == null) {
        tok.id = Tokens.EOF;
      }
      if ((c = reader.offset) !== start + 1) tok.offset2 = c;
      if (text) { PDESC.value = text; define(tok, 'text', PDESC); }
      return tok;
    }

    _ident(a, b,
      bYes = isIdentChar(b, a),
      c = bYes && this.reader.peek(2),
      cYes = c && (isIdentChar(c, b) || a === 92 && isSpace(c)),
      tok
    ) {
      const {reader} = this;
      const first = a === 92 ? (cYes = reader.offset--, reader.col--, '') : String.fromCharCode(a);
      const str = cYes ? reader.readMatch(rxName) : bYes ? reader.read() : '';
      const esc = a === 92 || b === 92 || bYes && c === 92 || str.length > 2 && str.includes('\\');
      const name = esc ? (first + str).replace(rxUnescapeNoLF, unescapeNoLF) : first + str;
      if (!tok) return {esc, name};
      if (a === 92) tok.lowCode = toLowAscii(name.charCodeAt(0));
      const vp = a === 45/*-*/ && b !== 45 && name.indexOf('-', 2) + 1;
      const next = cYes || esc && isSpace(c) ? reader.peek() : bYes ? c : b;
      let ovrValue = esc ? name : null;
      if (next === 40/*(*/) {
        reader.read();
        c = name.toLowerCase();
        b = (c === 'url' || c === 'url-prefix' || c === 'domain') && this.readUriValue();
        tok.id = b ? Tokens.URI : FUNCTION;
        tok.type = b ? 'uri' : 'fn';
        tok.name = vp ? c.slice(vp) : c;
        if (vp) tok.prefix = c.slice(1, vp - 1);
        if (b) tok.uri = b;
      } else if (next === 58/*:*/ && name === 'progid') {
        ovrValue = name + reader.readMatch(/.*?\(/y);
        tok.id = FUNCTION;
        tok.name = ovrValue.slice(0, -1).toLowerCase();
        tok.type = 'fn';
        tok.ie = true;
      } else {
        tok.id = IDENT;
        if (a === 45/*-*/ || (b = name.length) < 3 || b > 20) {
          tok.type = 'ident'; // named color min length is 3 (red), max is 20 (lightgoldenrodyellow)
        }
      }
      if (vp) {
        tok.vendorCode = toLowAscii(name.charCodeAt(vp));
        tok.vendorPos = vp;
      }
      return ovrValue;
    }

    _number(a, b, tok) {
      const {reader} = this;
      const isPlus = a === 43;
      const rx = b && (a === 46 ? rxNumberDot : a >= 48 && a <= 57 ? rxNumberDigit : rxNumberSign);
      const rest = b && reader.readMatch(rx) || '';
      const numStr = isPlus ? rest : String.fromCharCode(a) + rest;
      let ovrText, units;
      let c = reader.peek();
      if (c === 37) { // %
        tok.id = PCT;
        tok.type = units = reader.read(1, '%');
      } else if (isIdentStart(c)) {
        c = this._ident(reader.readCode(), reader.peek());
        units = c.name;
        ovrText = c.esc && (numStr + units);
        c = Units[units.toLowerCase()] || '';
        tok.id = c && UnitTypeIds[c] || Tokens.DIMENSION;
        tok.type = c;
      } else {
        tok.id = NUMBER;
        tok.type = 'number';
      }
      tok.units = units || '';
      tok.number = c = +numStr;
      tok.is0 = c === 0 && !units;
      tok.isInt = c = c === 0 || (isPlus ? rest : numStr) === `${c | 0}`;
      if (!c && tok.id === NTH) {
        tok.id = Tokens.DIMENSION;
        tok.type = '';
      }
      return ovrText;
    }

    _unicodeRange(token) {
      const {reader} = this;
      for (let v, pass = 0; pass < 2; pass++) {
        reader.mark();
        reader.read(); // +
        v = reader.readMatch(/[0-9a-f]{1,6}/iy);
        while (!pass && v.length < 6 && reader.peek() === 63/*?*/) {
          v += reader.read();
        }
        if (!v) {
          reader.reset();
          return;
        }
        if (!pass) {
          token.id = Tokens.UNICODE_RANGE;
          // if there's a ? in the first part, there can't be a second part
          if (v.includes('?') || reader.peek() !== 45/*-*/) return;
        }
      }
    }

    // returns null w/o resetting reader if string is invalid.
    readString(first) {
      const {reader} = this;
      const str = reader.readMatch(first === '"' ? rxStringDoubleQ : rxStringSingleQ);
      if (reader.readMatchStr(first)) return first + str + first;
    }

    // consumes the closing ")" on success
    readUriValue() {
      const {reader} = this;
      reader.mark();
      let v = reader.peek();
      v = v === 34/*"*/ || v === 39/*'*/ ? reader.read()
        : isSpace(v) && reader.readMatch(rxMaybeQuote).trim();
      if (!v) v = this.readChunksWithEscape('', rxUnquotedUrl);
      else if ((v = this.readString(v))) v = parseString(v);
      if (v != null && (reader.readMatchCode(41/*)*/) || reader.readMatch(rxSpaceRParen))) {
        return v;
      }
      reader.reset();
    }

    /**
     * @param {string} [first]
     * @param {RegExp} rx - must be sticky
     * @returns {string}
     */
    readChunksWithEscape(first, rx) {
      const str = (first || '') + this.reader.readMatch(rx);
      const res = str.includes('\\') ? str.replace(rxUnescapeNoLF, unescapeNoLF) : str;
      this._esc = res.length !== str.length;
      return res;
    }

    readNthChild() {
      const {reader} = this;
      const m = (this.readSpaceCmt(), reader.readMatch(rxNth, true)); if (!m) return;
      let a, b, ws;
      if (m[1]) a = m[1]; // even|odd
      else if (!(a = m[2])) b = m[0]; // B
      else if ((m[3] || !m[5] && (ws = this.readSpaceCmt(), m[3] = reader.readMatch(rxSign)))) {
        if (m[4] || (reader.mark(), this.readSpaceCmt(), m[4] = reader.readMatch(rxDigits))) {
          b = m[3] + m[4].trim();
        } else return reader.reset();
      }
      if ((a || b) && (ws || reader.readMatch(rxSpaceCmtRParen) != null)) {
        return [a || '', b || ''];
      }
    }

    readSpaceCmt() {
      const c = this.reader.peek();
      return (c === 47/*/*/ || isSpace(c)) && this.reader.readMatch(rxSpaceComments) || '';
    }

    /**
     * @param {boolean} [inBlock] - to read to the end of the current {}-block
     */
    skipDeclBlock(inBlock) {
      for (let {reader} = this, stack = [], end = inBlock ? 125 : -1, c; (c = reader.peek());) {
        if (c === end || end < 0 && (c === 59/*;*/ || c === 125/*}*/)) {
          end = stack.pop();
          if (!end || end < 0 && c === 125/*}*/) {
            if (end || c === 59/*;*/) reader.readCode(); // consuming ; or } of own block
            break;
          }
        } else if ((c = c === 123 ? 125/*{}*/ : c === 40 ? 41/*()*/ : c === 91 && 93/*[]*/)) {
          stack.push(end);
          end = c;
        }
        reader.readCode();
        reader.readMatch(end > 0 ? rxDeclBlock : rxDeclValue);
      }
      this._resetLT();
    }
  }

  //#endregion
  //#region parserCache

  /**
   * Caches the results and reuses them on subsequent parsing of the same code
   */
  const parserCache = (() => {
    const MAX_DURATION = 10 * 60e3;
    const TRIM_DELAY = 10e3;
    // all blocks since page load; key = text between block start and { inclusive
    const data = new Map();
    // nested block stack
    const stack = [];
    // performance.now() of the current parser
    let generation = null;
    // performance.now() of the first parser after reset or page load,
    // used for weighted sorting in getBlock()
    let generationBase = null;
    let parser = null;
    let stream = null;

    return {
      start(newParser) {
        parser = newParser;
        if (!parser) {
          data.clear();
          stack.length = 0;
          generationBase = performance.now();
          return;
        }
        stream = parser.stream;
        generation = performance.now();
        trim();
      },
      addEvent(event) {
        if (!parser) return;
        for (let i = stack.length; --i >= 0;) {
          const {offset, endOffset, events} = stack[i];
          if (event.offset >= offset && (!endOffset || event.offset <= endOffset)) {
            events.push(event);
            return;
          }
        }
      },
      findBlock(token = getToken()) {
        if (!token || !stream) return;
        const {reader} = stream;
        const {string} = reader;
        const start = token.offset;
        const key = string.slice(start, string.indexOf('{', start) + 1);
        let block = data.get(key);
        if (!block || !(block = getBlock(block, string, start, key))) return;
        shiftBlock(block, start, token.line, token.col, string);
        reader.offset = block.endOffset;
        reader.line = block.endLine;
        reader.col = block.endCol;
        stream._resetLT();
        return true;
      },
      startBlock(start = getToken()) {
        if (!start || !stream) return;
        stack.push({
          text: '',
          events: [],
          generation: generation,
          line: start.line,
          col: start.col,
          offset: start.offset,
          endLine: undefined,
          endCol: undefined,
          endOffset: undefined,
        });
        return stack.length;
      },
      endBlock(end = getToken()) {
        if (!parser || !stream) return;
        const block = stack.pop();
        block.endLine = end.line;
        block.endCol = end.col + end.offset2 - end.offset;
        block.endOffset = end.offset2;
        const {string} = stream.reader;
        const start = block.offset;
        const key = string.slice(start, string.indexOf('{', start) + 1);
        block.text = string.slice(start, block.endOffset);
        let blocks = data.get(key);
        if (!blocks) data.set(key, (blocks = []));
        blocks.push(block);
      },
      cancelBlock: pos => pos === stack.length && stack.length--,
      feedback({messages}) {
        messages = new Set(messages);
        for (const blocks of data.values()) {
          for (const block of blocks) {
            if (!block.events.length) continue;
            if (block.generation !== generation) continue;
            const {
              line: L1,
              col: C1,
              endLine: L2,
              endCol: C2,
            } = block;
            let isClean = true;
            for (const msg of messages) {
              const {line, col} = msg;
              if (L1 === L2 && line === L1 && C1 <= col && col <= C2 ||
                  line === L1 && col >= C1 ||
                  line === L2 && col <= C2 ||
                  line > L1 && line < L2) {
                messages.delete(msg);
                isClean = false;
              }
            }
            if (isClean) block.events.length = 0;
          }
        }
      },
    };

    /**
     * Removes old entries from the cache.
     * 'Old' means older than MAX_DURATION or half the blocks from the previous generation(s).
     * @param {Boolean} [immediately] - set internally when debounced by TRIM_DELAY
     */
    function trim(immediately) {
      if (!immediately) {
        clearTimeout(trim.timer);
        trim.timer = setTimeout(trim, TRIM_DELAY, true);
        return;
      }
      const cutoff = performance.now() - MAX_DURATION;
      for (const [key, blocks] of data.entries()) {
        const halfLen = blocks.length >> 1;
        const newBlocks = blocks
          .sort((a, b) => a.time - b.time)
          .filter((b, i) => (b = b.generation) > cutoff || b !== generation && i < halfLen);
        if (!newBlocks.length) {
          data.delete(key);
        } else if (newBlocks.length !== blocks.length) {
          data.set(key, newBlocks);
        }
      }
    }

    // gets the matching block
    function getBlock(blocks, input, start, key) {
      // extracted to prevent V8 deopt
      const keyLast = Math.max(key.length - 1);
      const check1 = input[start];
      const check2 = input[start + keyLast];
      const generationSpan = performance.now() - generationBase;
      blocks = blocks
        .filter(({text, offset, endOffset}) =>
          text[0] === check1 &&
          text[keyLast] === check2 &&
          text[text.length - 1] === input[start + text.length - 1] &&
          text.startsWith(key) &&
          text === input.substr(start, endOffset - offset))
        .sort((a, b) =>
          // newest and closest will be the first element
          (a.generation - b.generation) / generationSpan +
          (Math.abs(a.offset - start) - Math.abs(b.offset - start)) / input.length);
      // identical blocks may produce different reports in CSSLint
      // so we need to either hijack an older generation block or make a clone
      const block = blocks.find(b => b.generation !== generation);
      return block || deepCopy(blocks[0]);
    }

    // Shifts positions of the block and its events, also fires the events
    function shiftBlock(block, cursor, line, col, input) {
      // extracted to prevent V8 deopt
      const deltaLines = line - block.line;
      const deltaCols = block.col === 1 && col === 1 ? 0 : col - block.col;
      const deltaOffs = cursor - block.offset;
      const hasDelta = deltaLines || deltaCols || deltaOffs;
      const shifted = new Set();
      for (const e of block.events) {
        if (hasDelta) {
          applyDelta(e, shifted, block.line, deltaLines, deltaCols, deltaOffs, input);
        }
        parser.fire(e, false);
      }
      block.generation = generation;
      block.endCol += block.endLine === block.line ? deltaCols : 0;
      block.endLine += deltaLines;
      block.endOffset = cursor + block.text.length;
      block.line += deltaLines;
      block.col += deltaCols;
      block.offset = cursor;
    }

    // Recursively applies the delta to the event and all its nested parts
    function applyDelta(obj, seen, line, lines, cols, offs, input) {
      if (seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (let i = 0, v; i < obj.length; i++) {
          if ((v = obj[i]) && typeof v === 'object') {
            applyDelta(v, seen, line, lines, cols, offs, input);
          }
        }
        return;
      }
      for (let i = 0, keys = Object.keys(obj), k, v; i < keys.length; i++) {
        k = keys[i];
        if (k === 'col' ? (cols && obj.line === line && (obj.col += cols), 0)
          : k === 'endCol' ? (cols && obj.endLine === line && (obj.endCol += cols), 0)
          : k === 'line' ? (lines && (obj.line += lines), 0)
          : k === 'endLine' ? (lines && (obj.endLine += lines), 0)
          : k === 'offset' ? (offs && (obj.offset += offs), 0)
          : k === 'offset2' ? (offs && (obj.offset2 += offs), 0)
          : k === '_input' ? (obj._input = input, 0)
          : k !== 'target' && (v = obj[k]) && typeof v === 'object'
        ) {
          applyDelta(v, seen, line, lines, cols, offs, input);
        }
      }
    }

    // returns next token if it's already seen or the current token
    function getToken() {
      return parser && (stream.peekCached() || stream.token);
    }

    function deepCopy(obj) {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(deepCopy);
      }
      const copy = Object.create(Object.getPrototypeOf(obj));
      for (let arr = Object.keys(obj), k, v, i = 0; i < arr.length; i++) {
        v = obj[k = arr[i]];
        copy[k] = !v || typeof v !== 'object' ? v : deepCopy(v);
      }
      return copy;
    }
  })();

  //#endregion
  //#region Parser

  const ParserRoute = {};

  class Parser extends EventTarget {
    /**
     * @param {Object} [options]
     * @param {TokenStream} [options.stream]
     * @param {boolean} [options.ieFilters] - accepts IE < 8 filters instead of throwing
     * @param {boolean} [options.noValidation] - skip syntax validation
     * @param {boolean} [options.globalsOnly] - stop after _sheetGlobals()
     * @param {boolean} [options.starHack] - allows IE6 star hack
     * @param {boolean} [options.strict] - stop on errors instead of reporting them and continuing
     * @param {boolean} [options.topDocOnly] - quickly extract all top-level @-moz-document,
       their {}-block contents is retrieved as text using _simpleBlock()
     * @param {boolean} [options.underscoreHack] - interprets leading _ as IE6-7 for known props
     */
    constructor(options) {
      super();
      this.options = options || {};
      this.stream = null;
      /** @type {number} style rule nesting depth: when > 0 @nest and &-selectors are allowed */
      this._inStyle = 0;
    }

    /** 2+ = error, 1 = warning, anything else = info */
    alarm(level, msg, token) {
      this.fire({
        type: level >= 2 ? 'error' : level === 1 ? 'warning' : 'info',
        message: msg,
        recoverable: true,
      }, token);
    }
    /**
     * @param {string|Object} e
     * @param {Token} [tok=this.stream.token] - sets the position
     */
    fire(e, tok = e.offset != null ? e : this.stream.token) {
      if (typeof e === 'string') e = {type: e};
      if (tok && e.offset == null) { e.offset = tok.offset; e.line = tok.line; e.col = tok.col; }
      if (tok !== false) parserCache.addEvent(e);
      super.fire(e);
    }

    _layer(stream, start) {
      const ids = [];
      let tok;
      do {
        if ((tok = stream.get(2)).id === IDENT) {
          ids.push(this._layerName(stream, tok));
          tok = stream.get(2);
        }
        if (tok.id === LBRACE) {
          if (ids[1]) this.alarm(1, '@layer block cannot have multiple ids', start);
          this._ruleBlock(stream, start, ['layer', {id: ids[0], brace: tok}, start]);
          return;
        }
      } while (tok.id === COMMA);
      stream.mustMatch(SEMICOLON, {reuse: 1});
      this.fire({type: 'layer', ids}, start);
    }

    _layerName(stream, start) {
      let res = '';
      for (let tok; (tok = !res && start || stream.match(IDENT, !!res));) {
        res += tok.text;
        if (stream.match(DOT, false)) res += '.';
        else break;
      }
      return res;
    }

    _stylesheet(stream) {
      this.fire('startstylesheet');
      this._sheetGlobals(stream);
      const opts = this.options; if (opts.globalsOnly) return;
      const {topDocOnly} = opts;
      const actions = topDocOnly ? ParserRoute.topDoc : ParserRoute.stylesheet;
      for (let ti, tok, fn; (ti = (tok = stream.get(2)).id);) {
        try {
          if ((fn = actions[ti])) {
            fn.call(this, stream, tok);
          } else if (topDocOnly) {
            stream.skipDeclBlock(tok);
          } else if (!this._styleRule(stream, tok) && stream.get().id) {
            stream._failure();
          }
        } catch (ex) {
          if (ex instanceof SyntaxError && !opts.strict) {
            this.fire(assign({}, ex, {type: 'error', error: ex}));
          } else {
            ex.message = (ti = ex.stack).includes(fn = ex.message) ? ti : `${fn}\n${ti}`;
            ex.line = tok.line;
            ex.col = tok.col;
            throw ex;
          }
        }
      }
      this.fire('endstylesheet');
    }

    _sheetGlobals(stream) {
      for (let actions = ParserRoute.globals, tok; (tok = stream.match(actions));) {
        actions[tok.id].call(this, stream, tok);
      }
    }

    _charset(stream, start) {
      const charset = stream.mustMatch(Tokens.STRING).text;
      stream.mustMatch(SEMICOLON);
      this.fire({type: 'charset', charset}, start);
    }

    _import(stream, start) {
      let layer, name, tok;
      const uri = (tok = stream.mustMatch(TT.stringUri)).uri || tok.string;
      if ((name = (tok = stream.get(2)).name) === 'layer' || !name && B.layer.has(tok)) {
        layer = name ? this._layerName(stream) : '';
        if (name) stream.mustMatch(RPAREN);
        name = (tok = stream.get(2)).name;
      }
      if (name === 'supports') {
        this._supportsInParens(stream, {id: LPAREN});
        tok = null;
      }
      const media = this._mediaQueryList(stream, tok);
      stream.mustMatch(SEMICOLON);
      this.fire({type: 'import', layer, media, uri}, start);
    }

    _namespace(stream, start) {
      const prefix = stream.match(IDENT).text;
      const tok = stream.mustMatch(TT.stringUri);
      const uri = tok.uri || tok.string;
      stream.mustMatch(SEMICOLON);
      this.fire({type: 'namespace', prefix, uri}, start);
    }

    _container(stream, start) {
      const tok = stream.match(IDENT);
      this._ruleBlock(stream, start, ['container', {
        name: B.not.has(tok) ? stream.unget() : tok,
        condition: this._expr(stream, LBRACE),
        brace: stream.mustMatch(LBRACE, {reuse: 1}),
      }, start]);
    }

    _supports(stream, start) {
      this._supportsCondition(stream);
      this._ruleBlock(stream, start, ['supports', {}, start]);
    }

    _supportsCondition(stream) {
      if (stream.match(IDENT, B.not)) {
        this._supportsInParens(stream);
      } else {
        let more;
        do this._supportsInParens(stream);
        while ((more = stream.match(IDENT, !more ? B.andOr : more.lowCode === 97 ? B.and : B.or)));
      }
    }

    _supportsInParens(stream, tok = stream.match(TT.supportsInParens)) {
      let x, reuse;
      if ((x = tok.name) === 'selector') {
        tok = this._selector(stream);
        this.fire({type: 'supportsSelector', selector: tok}, tok);
        reuse = true;
      } else if (x) {
        this._function(stream, tok);
        reuse = 0;
      } else if (tok.id === LPAREN && (tok = stream.match(TT.supportsInParens))) {
        if (tok.id !== IDENT) {
          stream.unget();
          this._supportsCondition(stream);
        } else if (B.not.has(tok)) {
          this._supportsInParens(stream);
        } else if ((x = stream.match(TT.supportsIdentNext)).id === COLON) {
          return this._declaration(stream, tok, {colon: x, inParens: true});
        } else if (x) { // (
          this._expr(stream, RPAREN, true);
          reuse = true; // )
        }
      }
      if (reuse !== 0) stream.mustMatch(RPAREN, {reuse});
    }

    _media(stream, start) {
      const media = this._mediaQueryList(stream);
      this._ruleBlock(stream, start, ['media', {media}, start]);
    }

    _mediaQueryList(stream, tok) {
      const list = [];
      while ((tok = stream.match(TT.mediaList, {reuse: tok}))) {
        const expr = [];
        const mod = B.onlyNot.has(tok) && tok;
        const next = mod ? stream.mustMatch(TT.mediaList) : tok;
        const type = next.id === IDENT && next;
        if (!type) expr.push(this._mediaExpression(stream, next));
        while (stream.match(IDENT, type ? B.and : B.andOr)) {
          expr.push(this._mediaExpression(stream));
        }
        list.push(MediaQuery.from(mod || next, mod.text, type, expr));
        if (!stream.match(COMMA)) break;
        tok = false;
      }
      return list;
    }

    _mediaExpression(stream, paren) {
      stream.mustMatch(LPAREN, {reuse: paren});
      const feature = stream.mustMatch(TT.mediaValue);
      for (let tok, pass = 0; ++pass <= 2;) {
        tok = stream.get(2).text;
        if (tok.length === 1 && /^[:=<>]$/.test(tok)) {
          const isRange = /[<>]/.test(tok);
          if (isRange) stream.match(Tokens.EQUALS);
          feature.expr = this._expr(stream, RPAREN, true);
          feature.offset2 = stream.token.offset2;
          stream.unget();
          if (!isRange) break;
        } else {
          stream.unget();
          feature.expr = null;
          break;
        }
      }
      stream.mustMatch(RPAREN);
      return feature; // TODO: construct the value properly
    }

    _page(stream, start) {
      const tok = stream.match(IDENT); if (B.auto.has(tok)) stream._failure();
      const id = tok.text;
      const pseudo = stream.match(COLON, false) &&
        stream.mustMatch(IDENT, false).text;
      this._styleRuleBlock(stream, {
        margins: true,
        scope: start,
        event: ['page', {id, pseudo}, start],
      });
    }

    _margin(stream, tok) {
      this._styleRuleBlock(stream, {
        event: ['pagemargin', {margin: tok}],
      });
    }

    _nest(stream, _start) {
      this._styleRule(stream, stream.get(2), {nestSym: true});
    }

    _fontFace(stream, start) {
      this._styleRuleBlock(stream, {
        scope: start,
        event: ['fontface', {}, start],
      });
    }

    _fontPaletteValues(stream, start) {
      this._styleRuleBlock(stream, {
        scope: start,
        event: ['fontpalettevalues', {id: stream.mustMatch(IDENT)}, start],
      });
    }

    _document(stream, start) {
      const functions = [];
      do {
        const tok = stream.match(TT.docFunc);
        const fn = tok.uri ? TokenFunc.from(tok) : tok.name && this._function(stream, tok);
        if (fn && (fn.uri || fn.name === 'regexp')) functions.push(fn);
        else this.alarm(1, 'Unknown document function', fn);
      } while (stream.match(COMMA));
      const brace = stream.mustMatch(LBRACE);
      this.fire({type: 'startdocument', brace, functions, start}, start);
      if (this.options.topDocOnly) {
        stream.skipDeclBlock(true);
      } else {
        /* We allow @import and such inside document sections because the final generated CSS for
         * a given page may be valid e.g. if this section is the first one that matched the URL */
        this._sheetGlobals(stream);
        this._ruleBlock(stream, start);
      }
      this.fire({type: 'enddocument', start, functions});
    }

    _documentMisplaced(stream, start) {
      this.alarm(2, 'Nested @document produces broken code', start);
      this._document(stream, start);
    }

    _propertySym(stream, start) {
      const name = stream.mustMatch(IDENT);
      this._styleRuleBlock(stream, {
        scope: start,
        event: ['property', {name}, start],
      });
    }

    /** Warning! The next token is consumed */
    _selectorsGroup(stream, tok, relative) {
      const selectors = [];
      let comma;
      while ((tok = this._selector(stream, tok, relative))) {
        selectors.push(tok);
        if ((tok = stream.token).isVar) tok = stream.get(2);
        if (!(comma = tok.id === COMMA)) break;
        tok = relative = undefined;
      }
      if (comma) stream._failure();
      if (selectors[0]) return selectors;
    }

    /** Warning! The next token is consumed */
    _selector(stream, tok, relative) {
      const sel = [];
      if (!tok || tok.isVar) {
        tok = stream.get(2);
      }
      if (!relative || !TT.combinator[tok.id]) {
        tok = this._simpleSelectorSequence(stream, tok);
        if (!tok) return;
        sel.push(tok);
        tok = false;
      }
      for (let combinator, ws; ; tok = false) {
        if (!tok) tok = stream.token;
        if (TT.combinator[tok.id]) {
          sel.push(this._combinator(stream, tok));
          if ((tok = this._simpleSelectorSequence(stream))) {
            sel.push(tok);
            continue;
          }
          stream._failure();
        }
        while (tok.isVar) tok = stream.get();
        ws = tok.id === WS && tok; if (!ws) break;
        tok = stream.get(2); if (tok.id === LBRACE) break;
        combinator = TT.combinator[tok.id] && this._combinator(stream, tok);
        tok = this._simpleSelectorSequence(stream, combinator ? undefined : tok);
        if (tok) {
          sel.push(combinator || this._combinator(stream, ws));
          sel.push(tok);
          tok = false;
        } else if (combinator) {
          stream._failure();
        }
      }
      tok = TokenValue.from(sel);
      tok.amps = stream._amp;
      return tok;
    }

    /** Warning! The next token is consumed */
    _simpleSelectorSequence(stream, start = stream.get(2)) {
      const si = start.id;
      if (!TT.selectorStart[si]) return;
      stream._amp = si === AMP ? 1 : 0;
      let tok = start;
      let ns, tag;
      if (si === PIPE) {
        ns = true;
      } else if (si === STAR || si === IDENT) {
        if ((tok = stream.get()).id === PIPE) {
          ns = true;
          tok = false;
        } else tag = start;
      }
      if (ns && !(tag = stream.match(TT.identStar, false))) {
        if (si !== PIPE) stream.unget();
        return;
      }
      const mods = [];
      while (true) {
        if (!tok) tok = stream.get();
        const fn = ParserRoute.selector[tok.id];
        if (!(tok = fn && fn.call(this, stream, tok))) break;
        mods.push(tok);
        tok = false;
      }
      if (tag && tag !== start) {
        tag.col = start.col;
        tag.offset = start.offset;
        tag.lowCode = start.lowCode;
      }
      tok = Token.from(start);
      tok.elementName = tag || '';
      tok.modifiers = mods;
      tok.offset2 = (mods[mods.length - 1] || tok).offset2;
      return tok;
    }

    _amp(stream, tok) {
      tok.type = 'amp';
      tok.args = [];
      return tok;
    }

    _combinator(stream, tok = stream.match(TT.combinator)) {
      if (tok) tok.type = Combinators[tok.lowCode] || 'unknown';
      return tok;
    }

    _hash(stream, tok) {
      tok.type = 'id';
      tok.args = [];
      return tok;
    }

    _class(stream, tok) {
      tok = stream.mustMatch(IDENT, false);
      if (isOwn(tok, 'text')) tok.text = '.' + tok.text;
      tok.type = 'class';
      tok.col--;
      tok.offset--;
      tok.lowCode = 46; /* . */
      return tok;
    }

    _attrib(stream, start) {
      const t1 = stream.mustMatch(TT.attrStart);
      let t2, ns, name, eq, val, mod, end;
      if (t1.id === PIPE) { // [|
        ns = t1;
      } else if (t1.id === STAR) { // [*
        ns = t1;
        ns.offset2++;
        stream.mustMatch(PIPE, false);
      } else if ((t2 = stream.get()).id === PIPE) { // [ns|
        ns = t1;
        ns.offset2++;
      } else if (TT.attrEq[t2.id]) { // [name=, |=, ~=, ^=, *=, $=
        name = t1;
        eq = t2;
      } else if (TT.attrNameEnd[t2.id]) { // [name], [name/*[[var]]*/, [name<WS>
        name = t1;
        end = t2.id === RBRACKET && t2;
      } else { // [name<?>
        stream._failure('"]"', t2);
      }
      name = name || stream.mustMatch(IDENT, false);
      if (!eq && !end) {
        if ((t2 = stream.mustMatch(TT.attrEqEnd)).id === RBRACKET) end = t2; else eq = t2;
      }
      if (eq) {
        val = stream.mustMatch(TT.identString);
        if ((t2 = stream.get(2)).id === RBRACKET) end = t2;
        else if (B.attrIS.has(t2)) mod = t2;
        else stream._failure(B.attrIS, t2);
      }
      start.args = [
        /*0*/ ns || '',
        /*1*/ name,
        /*2*/ eq || '',
        /*3*/ val || '',
        /*4*/ mod || '',
      ];
      start.type = 'attribute';
      start.offset2 = (end || stream.mustMatch(RBRACKET)).offset2;
      return start;
    }

    _pseudo(stream, tok) {
      const colons = stream.match(COLON, false) ? '::' : ':';
      tok = stream.mustMatch(TT.pseudo, false);
      tok.col -= colons.length;
      tok.offset -= colons.length;
      tok.type = 'pseudo';
      let expr, n, x;
      if ((n = tok.name)) {
        if (n === 'nth-child' || n === 'nth-last-child') {
          expr = stream.readNthChild();
          const t0 = stream.get(0);
          const t2 = t0.id === WS ? stream.get(2) : t0;
          if (expr && B.of.has(t2)) n = 'not';
          else if (t2.id === RPAREN) x = true;
          else stream._failure('', t0);
        }
        if (n === 'not' || n === 'is' || n === 'where' || n === 'any' || n === 'has') {
          x = this._selectorsGroup(stream, undefined, n === 'has');
          if (!x) stream._failure('a selector');
          if (expr) expr.push(...x); else expr = x;
          stream.mustMatch(RPAREN, {reuse: 1});
        } else if (!x) {
          expr = this._expr(stream, RPAREN);
        }
        tok = TokenFunc.from(tok, expr, stream.token);
      }
      tok.args = expr && expr.parts || [];
      return tok;
    }

    _declaration(stream, tok, {colon, inParens, scope} = {}) {
      const opts = this.options;
      if (!tok && !(tok = stream.match(opts.starHack ? TT.identStar : IDENT))) {
        return;
      }
      if (tok.isVar) {
        return true;
      }
      let hack;
      if (tok.id === STAR) {
        if (!(tok = stream.match(IDENT, false))) { stream.unget(); return; }
        hack = '*'; tok.col--; tok.offset--;
      } else if (tok.lowCode === 95/*_*/ && opts.underscoreHack) {
        hack = '_';
      }
      if (hack) {
        tok.hack = hack;
        PDESC.value = tok.text.slice(1); define(tok, 'text', PDESC);
        PDESC.value = toStringPropHack; define(tok, 'toString', PDESC);
      }
      if (!colon) stream.mustMatch(COLON);
      const isCust = tok.type === 'custom-prop';
      const end = isCust ? TT.propCustomEnd : inParens ? TT.propValEndParen : TT.propValEnd;
      const value = this._expr(stream, end, isCust) ||
        isCust && TokenValue.empty(stream.token) ||
        stream._failure('');
      const invalid = !isCust && !opts.noValidation && validateProperty(tok, value, stream, scope);
      const important = stream.token.id === DELIM && stream.mustMatch(IDENT, B.important);
      this.fire({
        type: 'property',
        property: tok,
        message: invalid && invalid.message,
        important,
        invalid,
        value,
      }, tok);
      tok = stream.match(inParens ? RPAREN : TT.declEnd, {reuse: !important}).id;
      return inParens ? tok : tok === SEMICOLON || tok && (stream.unget(), tok);
    }

    /**
     * @param {TokenStream} stream
     * @param {TokenMap|number} end - will be consumed!
     * @param {boolean} [dumb] - <any-value> mode, no additional checks
     * @return {TokenValue|void}
     */
    _expr(stream, end, dumb) {
      const isEndMap = typeof end === 'object';
      const parts = [];
      let /** @type {Token} */ tok, ti, isVar, ie, x;
      while ((ti = (tok = stream.get(1)).id) && !(isEndMap ? end[ti] : end === ti)) {
        if ((x = PAIRING[ti])) {
          tok.expr = this._expr(stream, x, dumb || ti === LBRACE);
          if (stream.token.id !== x) stream._failure(x);
          tok.offset2 = stream.token.offset2;
          tok.type = 'block';
        } else if (ti === FUNCTION) {
          if (!tok.ie || (ie != null ? ie : ie = this.options.ieFilters)) {
            tok = this._function(stream, tok, dumb);
            isVar = isVar || tok.isVar;
          }
        } else if (ti === USO_VAR) {
          isVar = true;
        } else if (dumb) {
          // No smart processing of tokens in dumb mode, we'll just accumulate the values
        } else if (ti === HASH) {
          this._hexcolor(stream, tok);
        } else if (ti === IDENT && !tok.type) {
          x = tok.lowCode;
          tok.type = ((ti = x === 97) || x === 110) && tok.length === 4 && (
            ti ? B.auto.has(tok, 97) && (tok.isAuto = true)
               : B.none.has(tok, 110) && (tok.isNone = true)
          ) || !B.colors.has(tok, x) ? 'ident' : 'color';
        }
        parts.push(tok);
      }
      if (parts[0]) return assign(TokenValue.from(parts), isVar && {isVar: true});
    }

    _function(stream, tok, dumb) {
      return TokenFunc.from(tok, this._expr(stream, RPAREN, dumb), stream.token);
    }

    _hexcolor(stream, tok) {
      let text, len, offset, i, c;
      if ((len = tok.length) === 4 || len === 5 || len === 7 || len === 9) {
        if (isOwn(tok, 'text')) text = (offset = 0, tok.text);
        else ({_input: text, offset} = tok);
        for (i = 1; i < len; i++) {
          c = text.charCodeAt(offset + i); // 2-5x faster than slicing+parseInt or regexp
          if ((c < 48 || c > 57) && (c < 65 || c > 70) && (c < 97 || c > 102)) break;
        }
      }
      if (i === len) tok.type = 'color';
      else this.alarm(1, `Expected a hex color but found "${clipString(tok)}".`, tok);
    }

    _keyframes(stream, start) {
      const prefix = start.vendorPos ? start.text.slice(0, start.vendorPos) : '';
      const name = stream.mustMatch(TT.identString);
      stream.mustMatch(LBRACE);
      this.fire({type: 'startkeyframes', name, prefix}, start);
      // check for key
      while (true) {
        const keys = [this._key(stream, true)];
        if (!keys[0]) break;
        while (stream.match(COMMA)) {
          keys.push(this._key(stream));
        }
        this._styleRuleBlock(stream, {
          event: ['keyframerule', {keys}, keys[0]],
        });
      }
      stream.mustMatch(RBRACE);
      this.fire({type: 'endkeyframes', name, prefix});
    }

    _key(stream, optional) {
      return stream.match(PCT) || stream.match(IDENT, B.fromTo) ||
        !optional && stream._failure('percentage%, "from", "to"', stream.peek());
    }

    /** {}-block that can contain @-rule, _styleRule */
    _ruleBlock(stream, start, evt) {
      if (evt) {
        const [type, msg = evt[1] = {}, eTok] = evt;
        if (!msg.brace) msg.brace = stream.mustMatch(LBRACE);
        this.fire(assign({type: 'start' + type}, msg), eTok);
        evt = assign({type: 'end' + type}, msg);
      }
      let ti;
      for (let tok, fn; (ti = (tok = stream.get(2)).id) && ti !== RBRACE;) {
        if ((fn = ParserRoute.ruleset[ti])) fn.call(this, stream, tok);
        else if (!this._styleRule(stream, tok)) break;
      }
      if (ti !== RBRACE) stream.mustMatch(RBRACE);
      if (evt) this.fire(evt);
    }

    /** A style rule i.e. _selectorsGroup { _styleRuleBlock } */
    _styleRule(stream, tok, opts) {
      const nestSym = opts && opts.nestSym;
      // TODO: store isNestedRuleMisplaced in cache to enable caching of nested selectors?
      if (!nestSym && tok.id !== AMP && parserCache.findBlock(tok)) {
        return true;
      }
      let blk, brace;
      try {
        const sels = this._selectorsGroup(stream, tok);
        if (!sels) {
          if (nestSym) stream._failure('selector', tok);
          stream.unget();
          return;
        }
        if (nestSym || tok.id === AMP) {
          if (!this._inStyle) {
            this.alarm(2, 'Nested selector must be inside a style rule.', tok);
          }
          if ((tok = sels.find(isBadNesting, opts))) {
            this.alarm(2, `Nested selector must ${nestSym ? 'contain' : 'start with'} "&".`, tok);
          }
        }
        brace = stream.mustMatch(LBRACE, {reuse: 1});
        blk = parserCache.startBlock(sels[0]);
        if (!nestSym) this._inStyle++;
        this._styleRuleBlock(stream, {
          brace, event: ['rule', {selectors: sels}, sels[0]],
        });
        if (!nestSym) this._inStyle--;
        parserCache.endBlock();
      } catch (ex) {
        if (blk) parserCache.cancelBlock(blk);
        if (this.options.strict || !(ex instanceof SyntaxError)) throw ex;
        this._skipDeclaration(stream, ex, !!brace);
      }
      return true;
    }

    /**
     * {}-block that can contain _declaration, @-rule, &-prefixed _styleRule
     * @param {{}} [_]
     * @param {TokenStream} stream
     * @param {Token} [_.brace] - check for the left brace at the beginning.
     * @param {Array} [_.event] - ['name', {...props}?, startToken?]
     * @param {boolean|number} [_.margins] - check for margin patterns.
     * @param {Token|string} [_.scope] - definitions of valid properties
     */
    _styleRuleBlock(stream, {brace, margins, scope, event} = {}) {
      if (!brace) stream.mustMatch(LBRACE);
      if (margins) margins = Tokens.MARGIN_SYM;
      if (event) this.fire(assign({type: 'start' + event[0]}, event[1]), event[2]);
      const declOpts = scope ? {scope: scope.id ? Tokens[scope.id].text : scope} : {};
      const star = this.options.starHack && STAR;
      for (let tok, ti, fn, ex; (ti = (tok = stream.get(2)).id) !== RBRACE; ex = null) {
        if (ti === SEMICOLON) continue;
        try {
          if (ti === margins) {
            this._margin(stream, tok);
          } else if (!margins && (fn = ParserRoute.ruleset[ti])) {
            fn.call(this, stream, tok);
          } else if (!(ti === IDENT || ti === star)
          || !this._declaration(stream, tok, declOpts) && (tok = stream.peek())) {
            ex = this._inStyle && TT.selectorStart[tok.id]
              ? '";", &-prefix, prop:value, @condition'
              : '';
            ex = stream._failure(ex, tok, false);
          }
        } catch (e) {
          ex = e;
        }
        if (ex) {
          if (this.options.strict || !(ex instanceof SyntaxError)) throw ex;
          this._skipDeclaration(stream, ex);
        }
      }
      if (event) this.fire(assign({type: 'end' + event[0]}, event[1]));
    }

    _skipCruft(stream) {
      while (stream.match(TT.cruft)) { /*NOP*/ }
    }

    _skipDeclaration(stream, err, inBlock) {
      stream.skipDeclBlock(inBlock);
      this.fire(assign({}, err, {
        type: err.type || 'error',
        recoverable: true,
        error: err,
      }));
    }

    _unknownSym(stream, start) {
      if (this.options.strict) throw new SyntaxError('Unknown rule: ' + start, start);
      stream.skipDeclBlock();
    }

    parse(input, {reuseCache} = {}) {
      const stream = this.stream = new TokenStream(input);
      parserCache.start(reuseCache && this);
      this._stylesheet(stream);
    }
  }

  {
    const P = Parser.prototype;
    let obj = ParserRoute.ruleset = [];
    obj[AMP] = P._styleRule;
    obj[Tokens.CONTAINER_SYM] = P._container;
    obj[Tokens.DOCUMENT_SYM] = P._documentMisplaced;
    obj[Tokens.FONT_FACE_SYM] = P._fontFace;
    obj[Tokens.FONT_PALETTE_VALUES_SYM] = P._fontPaletteValues;
    obj[Tokens.KEYFRAMES_SYM] = P._keyframes;
    obj[Tokens.LAYER_SYM] = P._layer;
    obj[Tokens.MEDIA_SYM] = P._media;
    obj[Tokens.NEST_SYM] = P._nest;
    obj[Tokens.PAGE_SYM] = P._page;
    obj[Tokens.PROPERTY_SYM] = P._propertySym;
    obj[Tokens.SUPPORTS_SYM] = P._supports;
    obj[Tokens.UNKNOWN_SYM] = P._unknownSym;

    obj = ParserRoute.cruft = [];
    obj[Tokens.CDO] = P._skipCruft;
    obj[Tokens.CDC] = P._skipCruft;

    obj = ParserRoute.stylesheet = [].concat(ParserRoute.ruleset);
    obj[Tokens.DOCUMENT_SYM] = P._document;
    obj[Tokens.CDO] = P._skipCruft;
    obj[Tokens.CDC] = P._skipCruft;

    obj = ParserRoute.topDoc = [].concat(ParserRoute.cruft);
    obj[Tokens.DOCUMENT_SYM] = P._document;
    obj[Tokens.UNKNOWN_SYM] = P._unknownSym;

    obj = ParserRoute.globals = [].concat(ParserRoute.cruft);
    obj[Tokens.CHARSET_SYM] = P._charset;
    obj[Tokens.LAYER_SYM] = P._layer;
    obj[Tokens.IMPORT_SYM] = P._import;
    obj[Tokens.NAMESPACE_SYM] = P._namespace;

    obj = ParserRoute.selector = [];
    obj[AMP] = P._amp;
    obj[HASH] = P._hash;
    obj[DOT] = P._class;
    obj[LBRACKET] = P._attrib;
    obj[COLON] = P._pseudo;
  }

  //#endregion
  //#region Helper functions

  /** @this {?Object} options */
  function isBadNesting(sel) {
    return !(sel.id === AMP || !this || this.nestSym && sel.amps);
  }
  function toStringPropHack() {
    return this.hack + this.text;
  }
  //#endregion

  parserlib.css.Parser = Parser;
  parserlib.css.TokenStream = TokenStream;
  parserlib.util.cache = parserCache;

  if (typeof self !== 'undefined') self.parserlib = parserlib;
  else module.exports = parserlib; // eslint-disable-line no-undef
})();
