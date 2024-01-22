'use strict';
/* eslint-disable class-methods-use-this */

(() => {
  //#region Types

  const parserlib = typeof self !== 'undefined'
    ? (require('/js/csslint/parserlib-base'), self.parserlib)
    : require('./parserlib-base');
  const {assign, defineProperty: define} = Object;
  const {
    css: {
      Combinators,
      NamedColors,
      Tokens,
      Units,
    },
    util: {
      Bucket,
      EventTarget,
      StringSource,
      TokenIdByCode,
      UnitTypeIds,
      clipString,
      isOwn,
      pick,
      validateProperty,
    },
  } = parserlib;
  const {
    AMP, AT, CHAR, COLON, COMMA, COMMENT, DELIM, DOT, HASH, FUNCTION,
    IDENT, LBRACE, LBRACKET, LPAREN, MINUS, NUMBER, PCT, PIPE, PLUS,
    RBRACE, RBRACKET, RPAREN, SEMICOLON, STAR, UVAR, WS,
  } = Tokens;
  const TT = {
    attrEq: [Tokens.ATTR_EQ, Tokens.EQUALS],
    attrEqEnd: [Tokens.ATTR_EQ, Tokens.EQUALS, RBRACKET],
    attrStart: [PIPE, IDENT, STAR],
    attrNameEnd: [RBRACKET, UVAR, WS],
    colonLParen: [COLON, LPAREN],
    combinator: [PLUS, Tokens.GT, Tokens.COMBINATOR],
    condition: [FUNCTION, IDENT, LPAREN],
    declEnd: [SEMICOLON, RBRACE],
    docFunc: [FUNCTION, IDENT/* while typing a new func */, Tokens.URI],
    identStar: [IDENT, STAR],
    identString: [IDENT, Tokens.STRING],
    mediaList: [IDENT, LPAREN],
    mediaValue: [IDENT, NUMBER, Tokens.DIMENSION, Tokens.LENGTH],
    propCustomEnd: [DELIM, SEMICOLON, RBRACE, RBRACKET, RPAREN, Tokens.INVALID],
    propValEnd: [DELIM, SEMICOLON, RBRACE],
    propValEndParen: [DELIM, SEMICOLON, RBRACE, RPAREN],
    pseudo: [FUNCTION, IDENT],
    selectorStart: [AMP, PIPE, IDENT, STAR, HASH, DOT, LBRACKET, COLON],
    stringUri: [Tokens.STRING, Tokens.URI],
  };
  const B = /** @type {{[key:string]: Bucket}} */ {
    attrIS: ['i', 's', ']'], // "]" is to improve the error message,
    colors: NamedColors,
    marginSyms: (map => 'B-X,B-L-C,B-L,B-R-C,B-R,L-B,L-M,L-T,R-B,R-M,R-T,T-X,T-L-C,T-L,T-R-C,T-R'
      .replace(/[A-Z]/g, s => map[s]).split(',')
    )({B: 'bottom', C: 'corner', L: 'left', M: 'middle', R: 'right', T: 'top', X: 'center'}),
  };
  for (const k in B) B[k] = new Bucket(B[k]);
  for (const k of 'and,andOr,auto,autoNone,evenOdd,fromTo,important,layer,n,none,not,notOnly,of,or,to'
    .split(',')) B[k] = new Bucket(k.split(/(?=[A-Z])/)); // splitting by an Uppercase A-Z letter
  const OrDie = {must: true};
  const OrDieReusing = {must: true, reuse: true};
  const Parens = []; Parens[LBRACE] = RBRACE; Parens[LBRACKET] = RBRACKET; Parens[LPAREN] = RPAREN;
  const PDESC = {configurable: true, enumerable: true, writable: true, value: null};
  /** For these tokens stream.match() will return a UVAR unless the next token is a direct match */
  const UVAR_PROXY = [PCT, ...TT.mediaValue, ...TT.identString]
    .reduce((res, id) => (res[id] = true) && res, []);
  // Sticky `y` flag must be used in expressions for StringSource's readMatch
  // Groups must be non-capturing (?:foo) unless explicitly necessary
  const rxCommentUso = /(\*)\[\[[-\w]+]]\*\/|\*(?:[^*]+|\*(?!\/))*(?:\*\/|$)/y;
  const rxDigits = /\d+/y;
  const rxMaybeQuote = /\s*['"]?/y;
  const rxName = /(?:[-_\da-zA-Z\u00A0-\uFFFF]+|\\(?:(?:[0-9a-fA-F]{1,6}|.)[\t ]?|$))+/y;
  const rxNth = /(even|odd)|(?:([-+]?\d*n)(?:\s*([-+])(\s*\d+)?)?|[-+]?\d+)((?=\s+of\s+|\s*\)))?/yi;
  const rxNumberDigit = /\d*(?:(\.)\d*)?(?:(e)[+-]?\d+)?/iy;
  const rxNumberDot = /\d+(?:(e)[+-]?\d+)?/iy;
  const rxNumberSign = /(?:(\.)\d+|\d+(?:(\.)\d*)?)(?:(e)[+-]?\d+)?/iy;
  const rxSign = /[-+]/y;
  const rxSpace = /\s+/y;
  const rxSpaceCmtRParen = /(?=\s|\/\*|\))/y;
  const rxSpaceComments = /(?:\s+|\/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$))+/y;
  const rxSpaceRParen = /\s*\)/y;
  const rxStringDoubleQ = /(?:[^\n\\"]+|\\(?:([0-9a-fA-F]{1,6}|.)[\t ]?|\n|$))*/y;
  const rxStringSingleQ = /(?:[^\n\\']+|\\(?:([0-9a-fA-F]{1,6}|.)[\t ]?|\n|$))*/y;
  const rxUnescapeLF = /\\(?:(?:([0-9a-fA-F]{1,6})|(.))[\t ]?|(\n))/g;
  const rxUnescapeNoLF = /\\(?:([0-9a-fA-F]{1,6})|(.))[\t ]?/g;
  const rxUnicodeRange = /\+([\da-f]{1,6})(\?{1,6}|-([\da-f]{1,6}))?/iy; // U was already consumed
  const rxUnquotedUrl = /(?:[-!#$%&*-[\]-~\u00A0-\uFFFF]+|\\(?:(?:[0-9a-fA-F]{1,6}|.)[\t ]?|$))+/y;
  const [rxDeclBlock, rxDeclValue] = ((
    exclude = String.raw`'"{}()[\]\\/`,
    orSlash = ']|/(?!\\*))',
    blk = String.raw`(?:"[^"\n\\]*"|[^${exclude}${orSlash}*`,
    common = `(?:${[
      rxUnescapeLF.source,
      `"${rxStringDoubleQ.source}("|\n|$)`, // \n for bad string
      `'${rxStringSingleQ.source}('|\n|$)`, // \n for bad string
      String.raw`\(${blk}\)|\[${blk}]`,
      String.raw`/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$)`,
    ].join('|')}|`
  ) => [`{${blk}}|[^`, '[^;'].map(str => RegExp(common + str + exclude + orSlash + '+', 'y')))();
  const isRelativeSelector = sel => isOwn(TT.combinator, sel.parts[0].id);
  const isIdentChar = (c, prev) => c >= 97 && c <= 122 || c >= 65 && c <= 90 /* a-z A-Z */ ||
    c === 45 || c === 92 || c === 95 || c >= 160 || c >= 48 && c <= 57 /* - \ _ 0-9 */ ||
    prev === 92 /* \ */ && c !== 10 && c != null;
  const isIdentStart = (a, b) => a >= 97 && a <= 122 || a >= 65 && a <= 90 /* a-z A-Z */ ||
    a === 95 || a >= 160 || // _ unicode
    (a === 45/*-*/ ? b !== 45 && isIdentStart(b) : a === 92/*\*/ && isIdentChar(b, a));
  const isSpace = c => c === 9 && c === 10 || c === 32;
  const textToTokenMap = obj => Object.keys(obj).reduce((res, k) =>
    (((res[TokenIdByCode[k.charCodeAt(0)]] = obj[k]), res)), []);
  const toLowAscii = c => c >= 65 && c <= 90 ? c + 32 : c;
  const toStringPropHack = function () { return this.hack + this.text; };
  const unescapeNoLF = (m, code, char) => char || String.fromCodePoint(parseInt(code, 16));
  const unescapeLF = (m, code, char, LF) => LF ? '' : char ||
    String.fromCodePoint(parseInt(code, 16));
  const parseString = str => str.slice(1, -1).replace(rxUnescapeLF, unescapeLF);
  /**
   * @property {boolean} isUvp
   * @typedef {true[]} TokenMap - index is a token id
   */
  TT.nestSel = [...TT.selectorStart, ...TT.combinator];
  TT.nestSelBlock = [...TT.nestSel, LBRACE];
  for (const k in TT) {
    TT[k] = TT[k].reduce((res, id) => {
      if (UVAR_PROXY[id]) res.isUvp = 1;
      res[id] = true;
      return res;
    }, []);
  }

  //#endregion
  //#region Syntax units

  /**
   * @property {[]} [args] added in selectors
   * @property {string} [atName] lowercase name of @-rule without -vendor- prefix
   * @property {TokenValue} [expr] body of function or block
   * @property {boolean} [ie] ie function
   * @property {boolean} [is0] number is an integer 0 without units
   * @property {boolean} [isAttr] = attr()
   * @property {boolean} [isAuto] = auto
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
  class Token {
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

  /**
   * @property {()=>Token|false} grab - gets the next token skipping WS and UVAR
   */
  class TokenStream {

    constructor(input) {
      this.source = new StringSource(input ? `${input}` : '');
      /** Number of consumed "&" tokens */
      this._amp = 0;
      /** Lookahead buffer size */
      this._max = 4;
      /** Closing token of the currently processed block */
      this._pair = 0;
      this._resetBuf();
      define(this, 'grab', {writable: true, value: this.get.bind(this, true)});
    }

    _resetBuf() {
      /** @type {Token} Last consumed token object */
      this.token = null;
      /** Lookahead token buffer */
      this._buf = [];
      /** Current index may change due to unget() */
      this._cur = 0;
      /** Wrapping around the index to avoid splicing/shifting the array */
      this._cycle = 0;
    }

    /**
     * @param {TokenAcquisitionMode} [mode]
     * @return {Token}
     */
    get(mode) {
      let {_buf: buf, _cur: i, _max: MAX} = this;
      let tok, ti, slot;
      do {
        slot = (i + this._cycle) % MAX;
        if (i >= buf.length) {
          if (buf.length < MAX) i++;
          else this._cycle = (this._cycle + 1) % MAX;
          ti = (tok = buf[slot] = this._getToken(mode)).id;
          break;
        }
        ++i;
        ti = (tok = buf[slot]).id;
      } while (ti === COMMENT || mode && (ti === WS || ti === UVAR && mode !== UVAR));
      if (ti === AMP) this._amp++;
      this._cur = i;
      this.token = tok;
      return tok;
      /**
       * @typedef {number} TokenAcquisitionMode
       * 0/falsy: skip COMMENT;
       * UVAR id: skip COMMENT, WS;
       * anything else: skip COMMENT, WS, UVAR
       */
    }

    /**
     * Consumes the next token if it matches the condition(s).
     * @param {Token|TokenMap} what
     * @param {Bucket} [text]
     * @param {Token} [tok]
     * @param {{must?: boolean}} [opts]
     * @return {Token|false}
     */
    match(what, text, tok = this.get(), opts) {
      if ((typeof what === 'object' ? isOwn(what, tok.id) : !what || tok.id === what) &&
          (!text || text.has(tok))) {
        return tok;
      }
      if (opts !== UVAR) {
        this.unget();
        if (opts && opts.must) this._failure(text || what, tok);
        return false;
      }
    }

    /** @return {Token|false} */
    matchOrDie(what, text, tok) {
      return this.match(what, text, tok, OrDie);
    }

    /**
     * Skips whitespace and consumes the next token if it matches the condition(s).
     * @param {Token|TokenMap} what
     * @param {{}|Bucket} [opts]
     * @param {Token|boolean} [opts.reuse]
     * @param {boolean} [opts.must]
     * @param {Bucket} [opts.text]
     * @return {Token|false}
     */
    matchSmart(what, opts = {}) {
      let tok;
      const text = opts.has ? opts : (tok = opts.reuse, opts.text);
      const ws = typeof what === 'object' ? what[WS] : what === WS;
      let uvp = !ws && !text && (typeof what === 'object' ? what.isUvp : isOwn(UVAR_PROXY, what));
      tok = tok && (tok.id != null ? tok : this.token) || this.get(uvp ? UVAR : !ws);
      uvp = uvp && tok.isVar;
      return this.match(what, text, tok, uvp ? UVAR : opts) ||
        uvp && (this.match(what, text, this.grab()) || tok) ||
        false;
    }

    /** @return {Token} */
    peekCached() {
      return this._cur < this._buf.length && this._buf[(this._cur + this._cycle) % this._max];
    }

    /** Restores the last consumed token to the token stream. */
    unget() {
      if (this._cur) {
        if ((this.token || {}).id === AMP) this._amp--;
        this.token = this._buf[(--this._cur - 1 + this._cycle + this._max) % this._max];
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
     * @param {TokenAcquisitionMode} mode
     * @return {Token|void}
     */
    _getToken(mode) {
      const src = this.source;
      let a, b, c, text, col, line, offset;
      while (true) {
        ({col, line, offset} = src);
        a = src.readCode(); if (a == null) break;
        b = src.peek();
        if (a === 9/*\t*/ || a === 10/*\n*/ || a === 32/* " " */) {
          if (isSpace(b)) src.readMatch(rxSpace);
          if (!mode) { c = WS; break; }
        } else if (a === 47/*/*/ && b === 42/* * */) {
          a = src.readMatch(rxCommentUso, true);
          if (a[1] && mode === UVAR) { c = UVAR; break; }
        } else break;
      }
      const tok = new Token(c || CHAR, col, line, offset, src.string, a);
      if (c) {
        if (c === UVAR) tok.isVar = true;
      // [0-9]
      } else if (a >= 48 && a <= 57) {
        c = b >= 48 && b <= 57 || b === 46/*.*/ ||
          (b === 69 || b === 101) && (c = src.peek(2)) === 43 || c === 45 || c >= 48 && c <= 57;
        text = this._number(src, tok, a, b, c, rxNumberDigit);
      // [-+.]
      } else if ((a === 45 || a === 43 && (tok.id = PLUS) || a === 46 && (tok.id = DOT)) && (
      /* [-+.][0-9] */ b >= 48 && b <= 57 ||
      /* [-+].[0-9] */ b === 46/*.*/ && a !== 46 && (c = src.peek(2)) >= 48 && c <= 57
      )) {
        text = this._number(src, tok, a, b, 1, a === 46 ? rxNumberDot : rxNumberSign);
      // -
      } else if (a === 45) {
        if (b === 45/* -- */) {
          if (isIdentChar(c || (c = src.peek(2)), b)) {
            text = this._ident(src, tok, a, b, 1, c, 1);
            tok.type = '--';
          } else if (c === 62/* --> */) {
            src.read(2, '->');
            tok.id = Tokens.CDCO;
          } else {
            tok.id = MINUS;
          }
        } else if (isIdentStart(b, b === 92/*\*/ && (c || (c = src.peek(2))))) {
          text = this._ident(src, tok, a, b, 1, c);
        } else {
          tok.id = MINUS;
        }
      // U+ u+
      } else if ((a === 85 || a === 117) && b === 43) {
        c = src.readMatch(rxUnicodeRange, true);
        if (c && parseInt(c[1], 16) <= 0x10FFFF && (
          c[3] ? parseInt(c[3], 16) <= 0x10FFFF
            : !c[2] || (c[1] + c[2]).length <= 6
        )) {
          tok.id = Tokens.URANGE;
        } else {
          if (c) { src.col -= (c = c[0].length); src.offset -= c; }
          tok.id = IDENT;
          tok.type = 'ident';
        }
      // a-z A-Z \ _ unicode ("-" was handled above)
      } else if (isIdentStart(a, b)) {
        text = this._ident(src, tok, a, b);
      } else if ((c = b === 61 // =
      /* $= *= ^= |= ~= */
        ? (a === 36 || a === 42 || a === 94 || a === 124 || a === 126) &&
          Tokens.ATTR_EQ
      /* <= >= */
        || (a === 60 || a === 62) && Tokens.EQ_CMP
      /* || */
        : a === 124 && b === 124 &&
          Tokens.COMBINATOR
      )) {
        tok.id = c;
        src.readCode();
      // #
      } else if (a === 35) {
        if (isIdentChar(b, a)) {
          text = this._ident(src, tok, a, b, 1);
          tok.id = HASH;
        }
      // *
      } else if (a === 42) {
        tok.id = STAR;
        if (isIdentStart(b)) tok.hack = '*';
      // [.,:;>+~=|*{}[]()]
      } else if ((c = TokenIdByCode[a])) {
        tok.id = c;
      // ["']
      } else if (a === 34 || a === 39) {
        src.readMatch(a === 34 ? rxStringDoubleQ : rxStringSingleQ);
        if (src.readMatchCode(a)) {
          tok.id = Tokens.STRING;
          tok.type = 'string';
        } else {
          tok.id = Tokens.INVALID;
        }
      // \
      } else if (a === 92) {
        if (b == null) text = '\uFFFD';
        else if (b === 10) { tok.id = WS; text = src.readMatch(rxSpace); }
      // @
      } else if (a === 64) {
        if (isIdentStart(b, c = (b === 45/*-*/ || b === 92/*\*/) && src.peek(2))) {
          c = this._ident(src, null, src.readCode(), c || src.peek());
          a = c.name;
          text = c.esc && `@${a}`;
          a = a.charCodeAt(0) === 45/*-*/ && (c = a.indexOf('-', 1)) > 1 ? a.slice(c + 1) : a;
          tok.atName = a.toLowerCase();
          tok.id = AT;
        }
      // <
      } else if (a === 60) {
        if (b === 33/*!*/ && src.readMatchStr('!--')) {
          tok.id = Tokens.CDCO;
        }
      } else if (a == null) {
        tok.id = Tokens.EOF;
      }
      if ((c = src.offset) !== offset + 1) tok.offset2 = c;
      if (text) { PDESC.value = text; define(tok, 'text', PDESC); }
      return tok;
    }

    _ident(src, tok, a, b,
      bYes = isIdentChar(b, a),
      c = bYes && this.source.peek(2),
      cYes = c && (isIdentChar(c, b) || a === 92 && isSpace(c))
    ) {
      const first = a === 92 ? (cYes = src.offset--, src.col--, '') : String.fromCharCode(a);
      const str = cYes ? src.readMatch(rxName) : bYes ? src.read() : '';
      const esc = a === 92 || b === 92 || bYes && c === 92 || str.length > 2 && str.includes('\\');
      const name = esc ? (first + str).replace(rxUnescapeNoLF, unescapeNoLF) : first + str;
      if (!tok) return {esc, name};
      if (a === 92) tok.code = toLowAscii(name.charCodeAt(0));
      const vp = a === 45/*-*/ && b !== 45 && name.indexOf('-', 2) + 1;
      const next = cYes || esc && isSpace(c) ? src.peek() : bYes ? c : b;
      let ovrValue = esc ? name : null;
      if (next === 40/*(*/) {
        src.read();
        c = name.toLowerCase();
        if ((c === 'url' || c === 'url-prefix' || c === 'domain')
        && (b = this._uriValue(src)) != null) {
          tok.id = Tokens.URI;
          tok.type = 'uri';
          tok.uri = b;
        } else {
          tok.id = FUNCTION;
          tok.type = 'fn';
        }
        tok.name = vp ? c.slice(vp) : c;
        if (vp) tok.prefix = c.slice(0, vp);
      } else if (next === 58/*:*/ && name === 'progid') {
        ovrValue = name + src.readMatch(/.*?\(/y);
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

    _number(src, tok, a, b, bYes, rx) {
      const numStr = String.fromCharCode(a) + (bYes ? (b = src.readMatch(rx, true))[0] : '');
      const isFloat = a === 46/*.*/ || bYes && (b[1] || b[2] || b[3]);
      let ovrText, units;
      if ((a = bYes ? src.peek() : b) === 37) { // %
        tok.id = PCT;
        tok.type = units = src.read(1, '%');
      } else if (isIdentStart(a, b = (a === 45/*-*/ || a === 92/*\*/) && src.peek(2))) {
        a = this._ident(src, null, src.readCode(), b || src.peek());
        units = a.name;
        ovrText = a.esc && (numStr + units);
        a = Units[units = units.toLowerCase()] || '';
        tok.id = a && UnitTypeIds[a] || Tokens.DIMENSION;
        tok.type = a;
      } else {
        tok.id = NUMBER;
        tok.type = 'number';
      }
      tok.units = units || '';
      tok.number = a = +numStr;
      tok.is0 = b = !units && !a;
      tok.isInt = b || !units && !isFloat;
      return ovrText;
    }

    /** @param {StringSource} src */
    _spaceCmt(src) {
      const c = src.peek();
      return (c === 47/*/*/ || isSpace(c)) && src.readMatch(rxSpaceComments) || '';
    }

    /**
     * Consumes the closing ")" on success
     * @param {StringSource} [src]
     * @return {string|void}
     */
    _uriValue(src) {
      let v = src.peek();
      src.mark();
      v = v === 34/*"*/ || v === 39/*'*/ ? src.read()
        : isSpace(v) && src.readMatch(rxMaybeQuote).trim();
      if (v) {
        v += src.readMatch(v === '"' ? rxStringDoubleQ : rxStringSingleQ);
        v = src.readMatchStr(v[0]) && parseString(v + v[0]);
      } else if ((v = src.readMatch(rxUnquotedUrl)) && v.includes('\\')) {
        v = v.replace(rxUnescapeNoLF, unescapeNoLF);
      }
      if (v != null && (src.readMatchCode(41/*)*/) || src.readMatch(rxSpaceRParen))) {
        return v;
      }
      src.reset();
    }

    readNthChild() {
      const src = this.source;
      const m = (this._spaceCmt(src), src.readMatch(rxNth, true)); if (!m) return;
      let [, evenOdd, nth, sign, int, next] = m;
      let a, b, ws;
      if (evenOdd) a = evenOdd;
      else if (!(a = nth)) b = m[0]; // B
      else if ((sign || !next && (ws = this._spaceCmt(src), sign = src.readMatch(rxSign)))) {
        if (int || (src.mark(), this._spaceCmt(src), int = src.readMatch(rxDigits))) {
          b = sign + int.trim();
        } else return src.reset();
      }
      if ((a || b) && (ws || src.readMatch(rxSpaceCmtRParen) != null)) {
        return [a || '', b || ''];
      }
    }

    /**
     * @param {boolean} [inBlock] - to read to the end of the current {}-block
     */
    skipDeclBlock(inBlock) {
      let c = this.peekCached();
      if (c && (c.id === RBRACE || c.id === SEMICOLON)) return;
      for (let src = this.source, stack = [], end = inBlock ? 125 : -1; (c = src.peek());) {
        if (c === end || end < 0 && (c === 59/*;*/ || c === 125/*}*/)) {
          end = stack.pop();
          if (!end || end < 0 && c === 125/*}*/) {
            if (end || c === 59/*;*/) src.readCode(); // consuming ; or } of own block
            break;
          }
        } else if (c === 125/*}*/ || c === 41/*)*/ || c === 93/*]*/) {
          break;
        } else if ((c = c === 123 ? 125/*{}*/ : c === 40 ? 41/*()*/ : c === 91 && 93/*[]*/)) {
          stack.push(end);
          end = c;
        }
        src.readCode();
        src.readMatch(end > 0 ? rxDeclBlock : rxDeclValue);
      }
      this._resetBuf();
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
          const {offset, offset2, events} = stack[i];
          if (event.offset >= offset && (!offset2 || event.offset <= offset2)) {
            events.push(event);
            return;
          }
        }
      },
      findBlock(token = getToken()) {
        if (!token || !stream) return;
        const src = stream.source;
        const {string} = src;
        const start = token.offset;
        const key = string.slice(start, string.indexOf('{', start) + 1);
        let block = data.get(key);
        if (!block || !(block = getBlock(block, string, start, key))) return;
        shiftBlock(block, start, token.line, token.col, string);
        src.offset = block.offset2;
        src.line = block.line2;
        src.col = block.col2;
        stream._resetBuf();
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
          line2: undefined,
          col2: undefined,
          offset2: undefined,
        });
        return stack.length;
      },
      endBlock(end = getToken()) {
        if (!parser || !stream) return;
        const block = stack.pop();
        block.line2 = end.line;
        block.col2 = end.col + end.offset2 - end.offset;
        block.offset2 = end.offset2;
        const {string} = stream.source;
        const start = block.offset;
        const key = string.slice(start, string.indexOf('{', start) + 1);
        block.text = string.slice(start, block.offset2);
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
            const {line: L1, col: C1, line2: L2, col2: C2} = block;
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
        .filter(({text, offset, offset2}) =>
          text[0] === check1 &&
          text[keyLast] === check2 &&
          text[text.length - 1] === input[start + text.length - 1] &&
          text.startsWith(key) &&
          text === input.substr(start, offset2 - offset))
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
      block.col2 += block.line2 === block.line ? deltaCols : 0;
      block.line2 += deltaLines;
      block.offset2 = cursor + block.text.length;
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
          : k === 'col2' ? (cols && obj.line2 === line && (obj.col2 += cols), 0)
          : k === 'line' ? (lines && (obj.line += lines), 0)
          : k === 'line2' ? (lines && (obj.line2 += lines), 0)
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
  //#region Parser public API

  class Parser extends EventTarget {
    /**
     * @param {Object} [options]
     * @param {TokenStream} [options.stream]
     * @param {boolean} [options.ieFilters] - accepts IE < 8 filters instead of throwing
     * @param {boolean} [options.noValidation] - skip syntax validation
     * @param {boolean} [options.globalsOnly] - stop after all _fnGlobals()
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
      /** @type {number} @scope rule nesting depth: when > 0 relative and &-selectors are allowed */
      this._inScope = 0;
      /** @type {number} style rule nesting depth: when > 0 &-selectors are allowed */
      this._inStyle = 0;
      /** @type {Token[]} stack of currently processed nested blocks or rules */
      this._stack = [];
    }

    /** 2 and above = error, 2 = error (recoverable), 1 = warning, anything else = info */
    alarm(level, msg, token) {
      this.fire({
        type: level >= 2 ? 'error' : level === 1 ? 'warning' : 'info',
        message: msg,
        recoverable: level <= 2,
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

    parse(input, {reuseCache} = {}) {
      const stream = this.stream = new TokenStream(input);
      const opts = this.options;
      const atAny = !opts.globalsOnly && this._unknownAtRule;
      const atFuncs = !atAny ? Parser.GLOBALS : opts.topDocOnly ? Parser.AT_TDO : Parser.AT;
      parserCache.start(reuseCache && this);
      this.fire('startstylesheet');
      for (let ti, fn, tok; (ti = (tok = stream.grab()).id);) {
        try {
          if (ti === AT && (fn = atFuncs[tok.atName] || atAny)) {
            fn.call(this, stream, tok);
          } else if (ti === Tokens.CDCO) {
            // Skipping cruft
          } else if (!atAny) {
            stream.unget();
            break;
          } else if (!this._styleRule(stream, tok) && stream.grab().id) {
            stream._failure();
          }
        } catch (ex) {
          if (ex === Parser.GLOBALS) {
            break;
          }
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

    //#endregion
    //#region Parser @-rules utilities

    /**
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @param {function} [fn]
     */
    _condition(stream, tok = stream.grab(), fn) {
      if (B.not.has(tok)) {
        this._conditionInParens(stream, undefined, fn);
      } else {
        let more;
        do { this._conditionInParens(stream, tok, fn); tok = undefined; }
        while ((more = stream.matchSmart(IDENT, !more ? B.andOr : B.or.has(more) ? B.or : B.and)));
      }
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @param {function} [fn]
     */
    _conditionInParens(stream, tok = stream.matchSmart(TT.condition), fn) {
      let x, reuse, paren;
      if (fn && fn.call(this, stream, tok)) {
        // NOP
      } else if (tok.name) {
        this._function(stream, tok);
        reuse = 0;
      } else if (tok.id === LPAREN && (paren = tok, tok = stream.matchSmart(TT.condition))) {
        if (fn && fn.call(this, stream, tok, paren)) {
          // NOP
        } else if (tok.id !== IDENT) {
          this._condition(stream, tok);
        } else if (B.not.has(tok)) {
          this._conditionInParens(stream);
        } else if ((x = stream.matchSmart(TT.colonLParen)).id === COLON) {
          this._declaration(stream, tok, {colon: x, inParens: true});
          return; // ")" was consumed
        } else if (x) { // (
          this._expr(stream, RPAREN, true);
          reuse = true; // )
        }
      }
      if (reuse !== 0) stream.matchSmart(RPAREN, {must: 1, reuse});
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} tok
     * @param {Token} [paren]
     * @return {boolean|void}
     */
    _containerCondition(stream, tok, paren) {
      if (paren && tok.id === IDENT) {
        stream.unget();
        this._mediaExpression(stream, paren);
      } else if (!paren && tok.name === 'style') {
        this._condition(stream, {id: LPAREN});
      } else {
        return;
      }
      stream.unget();
      return true;
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [start]
     * @return {string}
     */
    _layerName(stream, start) {
      let res = '';
      let tok;
      while ((tok = !res && start || (res ? stream.match(IDENT) : stream.matchSmart(IDENT)))) {
        res += tok.text;
        if (stream.match(DOT)) res += '.';
        else break;
      }
      return res;
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} start
     */
    _margin(stream, start) {
      this._block(stream, start, {
        decl: true,
        event: ['pagemargin', {margin: start}],
      });
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [start]
     * @return {Token}
     */
    _mediaExpression(stream, start = stream.grab()) {
      if (start.id !== LPAREN) stream._failure(LPAREN);
      const feature = stream.matchSmart(TT.mediaValue, OrDie);
      feature.expr = this._expr(stream, RPAREN, true); // TODO: alarm on invalid ops
      feature.offset2 = stream.token.offset2; // including ")"
      stream.matchSmart(RPAREN, OrDieReusing);
      return feature;
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @return {TokenValue[]}
     */
    _mediaQueryList(stream, tok) {
      const list = [];
      while ((tok = stream.matchSmart(TT.mediaList, {reuse: tok}))) {
        const expr = [];
        const mod = B.notOnly.has(tok) && tok;
        const next = mod ? stream.matchSmart(TT.mediaList, OrDie) : tok;
        const type = next.id === IDENT && next;
        if (!type) expr.push(this._mediaExpression(stream, next));
        for (let more; stream.matchSmart(IDENT, more || (type ? B.and : B.andOr));) {
          if (!more) more = B.and.has(stream.token) ? B.and : B.or;
          expr.push(this._mediaExpression(stream));
        }
        tok = TokenValue.from(expr, mod || next);
        tok.type = type;
        list.push(tok);
        if (!stream.matchSmart(COMMA)) break;
        tok = null;
      }
      return list;
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} tok
     * @param {Token} [paren]
     * @return {boolean|void}
     */
    _supportsCondition(stream, tok, paren) {
      if (!paren && tok.name === 'selector') {
        tok = this._selector(stream);
        stream.unget();
        this.fire({type: 'supportsSelector', selector: tok}, tok);
        return true;
      }
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} start
     */
    _unknownAtRule(stream, start) {
      if (this.options.strict) throw new SyntaxError('Unknown rule: ' + start, start);
      stream.skipDeclBlock();
    }

    //#endregion
    //#region Parser selectors

    /**
     * Warning! The next token is consumed
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @param {boolean} [relative]
     * @return {TokenValue<TokenSelector>[]|void}
     */
    _selectorsGroup(stream, tok, relative) {
      const selectors = [];
      let comma;
      while ((tok = this._selector(stream, tok, relative))) {
        selectors.push(tok);
        if ((tok = stream.token).isVar) tok = stream.grab();
        if (!(comma = tok.id === COMMA)) break;
        tok = null;
      }
      if (comma) stream._failure();
      if (selectors[0]) return selectors;
    }

    /**
     * Warning! The next token is consumed
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @param {boolean} [relative]
     * @return {TokenValue<TokenSelector>|void}
     */
    _selector(stream, tok, relative) {
      const sel = [];
      if (!tok || tok.isVar) {
        tok = stream.grab();
      }
      if (!relative || !isOwn(TT.combinator, tok.id)) {
        tok = this._simpleSelectorSequence(stream, tok);
        if (!tok) return;
        sel.push(tok);
        tok = null;
      }
      for (let combinator, ws; ; tok = null) {
        if (!tok) tok = stream.token;
        if (isOwn(TT.combinator, tok.id)) {
          sel.push(this._combinator(stream, tok));
          sel.push(this._simpleSelectorSequence(stream) || stream._failure());
          continue;
        }
        while (tok.isVar) tok = stream.get();
        ws = tok.id === WS && tok; if (!ws) break;
        tok = stream.grab(); if (tok.id === LBRACE) break;
        combinator = isOwn(TT.combinator, tok.id) && this._combinator(stream, tok);
        tok = this._simpleSelectorSequence(stream, combinator ? undefined : tok);
        if (tok) {
          sel.push(combinator || this._combinator(stream, ws));
          sel.push(tok);
        } else if (combinator) {
          stream._failure();
        }
      }
      return TokenValue.from(sel);
    }

    /**
     * @typedef {Token & {
     * ns: string|Token
     * elementName: string|Token
     * modifiers: Token[]
     * }} TokenSelector
     */
    /**
     * Warning! The next token is consumed
     * @param {TokenStream} stream
     * @param {Token} [start]
     * @return {TokenSelector|void}
     */
    _simpleSelectorSequence(stream, start = stream.grab()) {
      let si = start.id;
      // --var:foo {...} allowed only as a declaration
      if (start.type === '--' || !isOwn(TT.selectorStart, si)) return;
      let ns, tag, t2;
      let tok = start;
      const mods = [];
      while (si === AMP) {
        mods.push(Parser.SELECTOR[AMP](stream, tok));
        si = (tok = stream.get()).id;
      }
      if (si === PIPE || (si === STAR || si === IDENT) && (t2 = stream.get()).id === PIPE) {
        ns = t2 ? tok : ''; tok = null;
      } else if (t2) {
        tag = tok; tok = t2;
      }
      if (ns && !(tag = stream.match(TT.identStar))) {
        if (si !== PIPE) stream.unget();
        return;
      }
      while (true) {
        if (!tok) tok = stream.get();
        const fn = Parser.SELECTOR[tok.id];
        if (!(tok = fn && fn.call(this, stream, tok))) break;
        mods.push(tok);
        tok = false;
      }
      tok = Token.from(start);
      tok.ns = ns;
      tok.elementName = tag || '';
      tok.modifiers = mods;
      tok.offset2 = (mods[mods.length - 1] || tok).offset2;
      return tok;
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @return {Token}
     */
    _combinator(stream, tok = stream.matchSmart(TT.combinator)) {
      if (tok) tok.type = Combinators[tok.code] || 'unknown';
      return tok;
    }

    //#endregion
    //#region Parser declaration

    /**
     * prop: value ["!" "important"]? [";" | ")"]
     * Consumes ")" when inParens is true.
     * When not inParens `tok` must be already vetted.
     * @param {TokenStream} stream
     * @param {Token} tok
     * @param {{}} [_]
     * @param {boolean} [_.colon] - ":" was consumed
     * @param {boolean} [_.inParens] - (declaration) in conditional media
     * @param {string} [_.scope] - name of section with definitions of valid properties
     * @return {boolean|void}
     */
    _declaration(stream, tok, {colon, inParens, scope} = {}) {
      const opts = this.options;
      const isCust = tok.type === '--';
      const hack = tok.hack
        ? (tok = stream.match(IDENT), tok.col--, tok.offset--, '*')
        : tok.code === 95/*_*/ && opts.underscoreHack && tok.id === IDENT && '_';
      const t2mark = !colon && stream.source.mark();
      const t2raw = colon || stream.get();
      const t2WS = t2raw.id === WS;
      const t2 = colon
        || (t2WS || t2raw.isVar) && stream.grab()
        || t2raw;
      let ti3;
      if (hack) {
        tok.hack = hack;
        PDESC.value = tok.text.slice(1); define(tok, 'text', PDESC);
        PDESC.value = toStringPropHack; define(tok, 'toString', PDESC);
      }
      if (t2.id !== COLON || (ti3 = stream.get(UVAR).id) === COLON) {
        while (stream.token !== tok) stream.unget();
        if (!inParens && (ti3 || isOwn(TT.nestSelBlock, t2.id))) return;
        if (tok.isVar) return true;
        if (inParens || isCust) stream._failure('":"', t2raw);
        return;
      }
      if (ti3 !== WS) stream.unget();
      const end = isCust ? TT.propCustomEnd : inParens ? TT.propValEndParen : TT.propValEnd;
      const expr = this._expr(stream, end, isCust);
      const t = stream.token;
      const value = expr || isCust && TokenValue.empty(t);
      if (!inParens && t.id === LBRACE) {
        if (ti3 !== IDENT && ti3 !== FUNCTION) {
          stream._pair = RBRACE;
          throw new SyntaxError(`Unexpected "{" in "${tok}" declaration`, t);
        }
        // TODO: if not as rare as alleged, make a flat array in _expr() and reuse it
        stream.source.reset(t2mark);
        stream._resetBuf();
        return;
      }
      if (!value) stream._failure('');
      const invalid = !isCust && !tok.isVar && !opts.noValidation &&
        validateProperty(tok, value, stream, scope);
      const important = t.id === DELIM &&
        stream.matchSmart(IDENT, {must: 1, text: B.important});
      const ti = stream.matchSmart(inParens ? RPAREN : TT.declEnd, {must: 1, reuse: !important}).id;
      this.fire({
        type: 'property',
        property: tok,
        message: invalid && invalid.message,
        important,
        inParens,
        invalid,
        scope,
        value,
      }, tok);
      if (ti === RBRACE) stream.unget();
      return ti;
    }

    /**
     * @param {TokenStream} stream
     * @param {?} err
     * @param {boolean} [inBlock]
     */
    _declarationFailed(stream, err, inBlock) {
      const c = stream._pair;
      if (c) { stream._pair = 0; this._expr(stream, c, true); }
      stream.skipDeclBlock(inBlock);
      this.fire(assign({}, err, {
        type: err.type || 'error',
        recoverable: !stream.source.eof(),
        error: err,
      }));
    }

    /**
     * @param {TokenStream} stream
     * @param {TokenMap|number} end - will be consumed!
     * @param {boolean} [dumb] - <any-value> mode, no additional checks
     * @return {TokenValue|void}
     */
    _expr(stream, end, dumb) {
      const parts = [];
      const isEndMap = typeof end === 'object';
      let /** @type {Token} */ tok, ti, isVar, endParen;
      while ((ti = (tok = stream.get(UVAR)).id) && !(isEndMap ? end[ti] : end === ti)) {
        if ((endParen = Parens[ti])) {
          if (!dumb && ti === LBRACE && parts.length) break;
          tok.expr = this._expr(stream, endParen, dumb, ti === LBRACE);
          if (stream.token.id !== endParen) stream._failure(endParen);
          tok.offset2 = stream.token.offset2;
          tok.type = 'block';
        } else if (ti === FUNCTION) {
          if (!tok.ie || this.options.ieFilters) {
            tok = this._function(stream, tok, dumb);
            isVar = isVar || tok.isVar;
          }
        } else if (ti === UVAR) {
          isVar = true;
        } else if (dumb) {
          // No smart processing of tokens in dumb mode, we'll just accumulate the values
        } else if (ti === HASH) {
          this._hexcolor(stream, tok);
        } else if (ti === IDENT && !tok.type) {
          if (B.autoNone.has(tok)) {
            tok[tok.code === 97 ? 'isAuto' : 'isNone'] = true;
            tok.type = 'ident';
          } else {
            tok.type = B.colors.has(tok) ? 'color' : 'ident';
          }
        }
        parts.push(tok);
      }
      if (parts[0]) {
        const res = TokenValue.from(parts);
        if (isVar) res.isVar = true;
        return res;
      }
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} [tok]
     * @param {boolean} [dumb]
     * @return {TokenFunc}
     */
    _function(stream, tok, dumb) {
      return TokenFunc.from(tok, this._expr(stream, RPAREN, dumb), stream.token);
    }

    /**
     * @param {TokenStream} stream
     * @param {Token} tok
     */
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

    //#endregion
    //#region Parser rulesets

    /**
     * @prop {Token} [brace]
     * @prop {boolean} [decl] - can contain prop:value declarations
     * @prop {Array|{}} [event] - ['name', {...props}?]
     * @prop {boolean} [margins] - check for the margin @-rules.
     * @prop {boolean} [scoped] - use ScopedProperties for the start token's name
     * @typedef {{}} RuleBlockOpts
     */

    /**
     * A style rule i.e. _selectorsGroup { _block }
     * @param {TokenStream} stream
     * @param {Token} tok
     * @param {RuleBlockOpts} [opts]
     * @return {true|void}
     */
    _styleRule(stream, tok, opts) {
      const canCache = !this._inStyle;
      if (canCache && parserCache.findBlock(tok)) {
        return true;
      }
      let blk, brace;
      try {
        const amps = tok.id === AMP ? -1 : stream._amp;
        const sels = this._selectorsGroup(stream, tok, true);
        if (!sels) { stream.unget(); return; }
        if (!this._inScope && !this._inStyle && (stream._amp > amps || sels.some(isRelativeSelector))) {
          this.alarm(2, 'Nested selector must be inside a style rule.', tok);
        }
        brace = stream.matchSmart(LBRACE, OrDieReusing);
        blk = canCache && parserCache.startBlock(sels[0]);
        const msg = {selectors: sels};
        const opts2 = {brace, decl: true, event: ['rule', msg]};
        this._block(stream, sels[0], opts ? assign({}, opts, opts2) : opts2);
        if (blk && !msg.empty) blk = (parserCache.endBlock(), 0);
      } catch (ex) {
        if (this.options.strict || !(ex instanceof SyntaxError)) throw ex;
        this._declarationFailed(stream, ex, !!brace);
        return;
      } finally {
        if (blk) parserCache.cancelBlock(blk);
      }
      return true;
    }

    /**
     * {}-block that can contain _declaration, @-rule, &-prefixed _styleRule
     * @param {TokenStream} stream
     * @param {Token} start
     * @param {RuleBlockOpts} [opts]
     */
    _block(stream, start, opts = {}) {
      const {margins, scoped, decl, event = []} = opts;
      const {brace = stream.matchSmart(LBRACE, OrDie)} = opts;
      const [type, msg = event[1] = {}] = event || [];
      if (type) this.fire(assign({type: 'start' + type, brace}, msg), start);
      const declOpts = scoped ? {scope: start.atName} : {};
      const inStyle = (this._inStyle += decl ? 1 : 0);
      const star = inStyle && this.options.starHack && STAR;
      this._stack.push(start);
      let ex, child;
      let prevTok;
      for (let tok, ti, fn; (ti = (tok = stream.get(UVAR)).id) && ti !== RBRACE; ex = null) {
        if (ti === SEMICOLON || ti === UVAR && (child = 1)) {
          continue;
        }
        if (tok === prevTok) {
          stream._failure('');
        }
        prevTok = tok;
        try {
          if (ti === AT) {
            fn = tok.atName;
            fn = margins && B.marginSyms.has(fn) && this._margin ||
              Parser.AT[fn] ||
              this._unknownAtRule;
            fn.call(this, stream, tok);
            child = 1;
          } else if (inStyle && (ti === IDENT || ti === star && tok.hack)
              && this._declaration(stream, tok, declOpts)) {
            child = 1;
          } else if (!scoped && tok.type !== '--' && (!inStyle || isOwn(TT.nestSel, ti))) {
            child = this._styleRule(stream, tok, opts);
          } else {
            ex = stream._failure('', tok, false);
          }
        } catch (e) {
          ex = e;
        }
        if (ex) {
          if (this.options.strict || !(ex instanceof SyntaxError)) break;
          this._declarationFailed(stream, ex);
          if (!ti) break;
          ex = null;
        }
      }
      this._stack.pop();
      if (decl) this._inStyle--;
      if (ex) throw ex;
      if (type) { msg.empty = !child; this.fire(assign({type: 'end' + type}, msg)); }
    }
  }

  //#endregion
  //#region Parser @-rules

  /** Functions for @ symbols */
  Parser.AT = {
    __proto__: null,

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    charset(stream, start) {
      const charset = stream.matchSmart(Tokens.STRING, OrDie);
      stream.matchSmart(SEMICOLON, OrDie);
      this.fire({type: 'charset', charset}, start);
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    container(stream, start) {
      const tok = stream.matchSmart(IDENT);
      const name = B.not.has(tok) ? stream.unget() : tok;
      this._condition(stream, undefined, this._containerCondition);
      this._block(stream, start, {event: ['container', {name}]});
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    document(stream, start) {
      if (this._stack.length) this.alarm(2, 'Nested @document produces broken code', start);
      const functions = [];
      do {
        const tok = stream.matchSmart(TT.docFunc);
        const uri = tok.uri != null;
        const fn = uri ? TokenFunc.from(tok) : tok.name && this._function(stream, tok);
        if (fn && (uri || fn.name === 'regexp')) functions.push(fn);
        else this.alarm(1, 'Unknown document function', fn);
      } while (stream.matchSmart(COMMA));
      const brace = stream.matchSmart(LBRACE, OrDie);
      this.fire({type: 'startdocument', brace, functions, start}, start);
      if (this.options.topDocOnly) {
        stream.skipDeclBlock(true);
        stream.matchSmart(RBRACE, OrDie);
      } else {
        this._block(stream, start, {brace});
      }
      this.fire({type: 'enddocument', start, functions});
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    'font-face'(stream, start) {
      this._block(stream, start, {
        decl: true,
        event: ['fontface', {}],
        scoped: true,
      });
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    'font-palette-values'(stream, start) {
      this._block(stream, start, {
        decl: true,
        event: ['fontpalettevalues', {id: stream.matchSmart(IDENT, OrDie)}],
        scoped: true,
      });
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    import(stream, start) {
      let layer, name, tok;
      const uri = (tok = stream.matchSmart(TT.stringUri, OrDie)).uri || tok.string;
      if ((name = (tok = stream.grab()).name) === 'layer' || !name && B.layer.has(tok)) {
        layer = name ? this._layerName(stream) : '';
        if (name) stream.matchSmart(RPAREN, OrDie);
        name = (tok = stream.grab()).name;
      }
      if (name === 'supports') {
        this._conditionInParens(stream, {id: LPAREN});
        tok = null;
      }
      const media = this._mediaQueryList(stream, tok);
      stream.matchSmart(SEMICOLON, OrDie);
      this.fire({type: 'import', layer, media, uri}, start);
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    keyframes(stream, start) {
      const prefix = start.vendorPos ? start.text.slice(0, start.vendorPos) : '';
      const name = stream.matchSmart(TT.identString, OrDie);
      stream.matchSmart(LBRACE, OrDie);
      this.fire({type: 'startkeyframes', name, prefix}, start);
      let tok, ti;
      while (true) {
        const keys = [];
        do {
          ti = (tok = stream.grab()).id;
          if (ti === PCT || ti === IDENT && B.fromTo.has(tok)) keys.push(tok);
          else if (!keys[0]) break;
          else stream._failure('percentage%, "from", "to"', tok);
        } while ((ti = (tok = stream.grab()).id) === COMMA);
        if (!keys[0]) break;
        this._block(stream, keys[0], {
          decl: true,
          brace: ti === LBRACE ? tok : stream.unget(),
          event: ['keyframerule', {keys}],
        });
      }
      if (ti !== RBRACE) stream.matchSmart(RBRACE, OrDie);
      this.fire({type: 'endkeyframes', name, prefix});
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    layer(stream, start) {
      const ids = [];
      let tok;
      do {
        if ((tok = stream.grab()).id === IDENT) {
          ids.push(this._layerName(stream, tok));
          tok = stream.grab();
        }
        if (tok.id === LBRACE) {
          if (this.options.globalsOnly) {
            this.stream.token = start;
            throw Parser.GLOBALS;
          }
          if (ids[1]) this.alarm(1, '@layer block cannot have multiple ids', start);
          this._block(stream, start, {brace: tok, event: ['layer', {id: ids[0]}]});
          return;
        }
      } while (tok.id === COMMA);
      stream.matchSmart(SEMICOLON, {must: 1, reuse: tok});
      this.fire({type: 'layer', ids}, start);
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    media(stream, start) {
      const media = this._mediaQueryList(stream);
      this._block(stream, start, {event: ['media', {media}]});
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    namespace(stream, start) {
      const prefix = stream.matchSmart(IDENT).text;
      const tok = stream.matchSmart(TT.stringUri, OrDie);
      const uri = tok.uri || tok.string;
      stream.matchSmart(SEMICOLON, OrDie);
      this.fire({type: 'namespace', prefix, uri}, start);
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    page(stream, start) {
      const tok = stream.matchSmart(IDENT);
      if (B.auto.has(tok)) stream._failure();
      const id = tok.text;
      const pseudo = stream.match(COLON) && stream.matchOrDie(IDENT).text;
      this._block(stream, start, {
        decl: true,
        event: ['page', {id, pseudo}],
        margins: true,
        scoped: true,
      });
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    property(stream, start) {
      const name = stream.matchSmart(IDENT, OrDie);
      this._block(stream, start, {
        decl: true,
        event: ['property', {name}],
        scoped: true,
      });
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    scope(stream, start) {
      const mark = stream.source.mark();
      let a, b;
      let tok = stream.grab();
      try {
        if (tok.id === LPAREN) {
          a = this._selectorsGroup(stream);
          stream.matchSmart(RPAREN, OrDieReusing);
          tok = stream.grab();
        }
        if (a && B.to.has(tok)) {
          stream.matchSmart(LPAREN, OrDie);
          b = this._selectorsGroup(stream);
          stream.matchSmart(RPAREN, OrDieReusing);
          tok = stream.grab();
        }
        tok = stream.matchSmart(LBRACE, OrDieReusing);
      } catch (err) {
        stream.source.reset(mark);
        stream._resetBuf();
        this._declarationFailed(stream, err);
        return;
      }
      this._inScope++;
      // TODO: reuse csslint::known-pseudos rule to throw on pseudo-element selectors per spec
      this._block(stream, start, {event: ['scope', {start: a, end: b}], brace: tok});
      this._inScope--;
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    supports(stream, start) {
      this._condition(stream, undefined, this._supportsCondition);
      this._block(stream, start, {event: ['supports']});
    },
  };

  /** topDocOnly mode */
  Parser.AT_TDO = pick(Parser.AT, ['document']);

  /** @-rules at the top level of the stylesheet */
  Parser.GLOBALS = pick(Parser.AT, ['charset', 'import', 'layer', 'namespace']);

  /** Functions for selectors */
  Parser.SELECTOR = textToTokenMap({

    '&': (stream, tok) => assign(tok, {type: 'amp', args: []}),
    '#': (stream, tok) => assign(tok, {type: 'id', args: []}),

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} tok
     */
    '.'(stream, tok) {
      const t2 = stream.matchOrDie(IDENT);
      if (isOwn(t2, 'text')) tok.text = '.' + t2.text;
      tok.offset2 = t2.offset2;
      tok.type = 'class';
      return tok;
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} start
     */
    '['(stream, start) {
      const t1 = stream.matchSmart(TT.attrStart, OrDie);
      let t2, ns, name, eq, val, mod, end;
      stream._pair = RBRACKET;
      if (t1.id === PIPE) { // [|
        ns = t1;
      } else if (t1.id === STAR) { // [*
        ns = t1;
        ns.offset2 = stream.matchOrDie(PIPE).offset2;
        if (ns.length > 2) ns.text = '*|'; // comment inside
      } else if ((t2 = stream.get()).id === PIPE) { // [ns|
        ns = t1;
        ns.offset2++;
      } else if (isOwn(TT.attrEq, t2.id)) { // [name=, |=, ~=, ^=, *=, $=
        name = t1;
        eq = t2;
      } else if (isOwn(TT.attrNameEnd, t2.id)) { // [name], [name/*[[var]]*/, [name<WS>
        name = t1;
        end = t2.id === RBRACKET && t2;
      } else { // [name<?>
        stream._failure('"]"', t2);
      }
      name = name || stream.matchOrDie(IDENT);
      if (!eq && !end) {
        if ((t2 = stream.matchSmart(TT.attrEqEnd, OrDie)).id === RBRACKET) end = t2; else eq = t2;
      }
      if (eq) {
        val = stream.matchSmart(TT.identString, OrDie);
        if ((t2 = stream.grab()).id === RBRACKET) end = t2;
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
      start.offset2 = (end || stream.matchSmart(RBRACKET, OrDie)).offset2;
      stream._pair = 0;
      return start;
    },

    /**
     * @this {Parser}
     * @param {TokenStream} stream
     * @param {Token} tok
     */
    ':'(stream, tok) {
      const colons = stream.match(COLON) ? '::' : ':';
      tok = stream.matchOrDie(TT.pseudo);
      tok.col -= colons.length;
      tok.offset -= colons.length;
      tok.type = 'pseudo';
      let expr, n, x;
      if ((n = tok.name)) {
        stream._pair = RPAREN;
        if (n === 'nth-child' || n === 'nth-last-child') {
          expr = stream.readNthChild();
          const t1 = stream.get();
          const t2 = t1.id === WS ? stream.grab() : t1;
          if (expr && B.of.has(t2)) n = 'not';
          else if (t2.id === RPAREN) x = true;
          else stream._failure('', t1);
        }
        if (n === 'not' || n === 'is' || n === 'where' || n === 'any' || n === 'has') {
          x = this._selectorsGroup(stream, undefined, n === 'has');
          if (!x) stream._failure('a selector');
          if (expr) expr.push(...x); else expr = x;
          stream.matchSmart(RPAREN, OrDieReusing);
        } else if (!x) {
          expr = this._expr(stream, RPAREN);
        }
        tok = TokenFunc.from(tok, expr, stream.token);
        stream._pair = 0;
      }
      tok.args = expr && expr.parts || [];
      return tok;
    },
  });

  //#endregion

  parserlib.css.Parser = Parser;
  parserlib.css.TokenStream = TokenStream;
  parserlib.util.cache = parserCache;

  if (typeof self !== 'undefined') self.parserlib = parserlib;
  else module.exports = parserlib; // eslint-disable-line no-undef
})();
