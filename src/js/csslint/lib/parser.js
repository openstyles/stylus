/* eslint-disable class-methods-use-this */
import {B} from './bucket';
import Combinators from './combinators';
import ATS, {ATS_GLOBAL, ATS_TDO} from './parser-ats';
import * as parserCache from './parser-cache';
import SELECTORS from './parser-selector';
import Token, {TokenFunc, TokenValue} from './token';
import TokenStream, {OrDie, OrDieReusing, TT} from './token-stream';
import {
  AMP, AT, CDCO, COLON, COMMA, DELIM, DOT, FUNCTION, HASH, IDENT, LBRACE, LBRACKET, LPAREN, PIPE,
  RBRACE, RBRACKET, RPAREN, SEMICOLON, STAR, UVAR, WS,
} from './tokens';
import {assign, clipString, define, EventDispatcher, isOwn, ParseError, PDESC} from './util';
import {validateProperty} from './validation';

const Parens = []; Parens[LBRACE] = RBRACE; Parens[LBRACKET] = RBRACKET; Parens[LPAREN] = RPAREN;
const isRelativeSelector = sel => isOwn(TT.combinator, sel.parts[0].id);
const toStringPropHack = function () { return this.hack + this.text; };

//#region Parser public API

class Parser extends EventDispatcher {
  static AT = ATS;
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
    this._events = null;
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
    if (this._events) {
      this._events.push(arguments);
      return;
    }
    if (typeof e === 'string') e = {type: e};
    if (tok && e.offset == null) { e.offset = tok.offset; e.line = tok.line; e.col = tok.col; }
    if (tok !== false) parserCache.addEvent(e);
    super.fire(e);
  }

  parse(input, {reuseCache} = {}) {
    const stream = this.stream = new TokenStream(input);
    const opts = this.options;
    const atAny = !opts.globalsOnly && this._unknownAtRule;
    const atFuncs = !atAny ? ATS_GLOBAL : opts.topDocOnly ? ATS_TDO : ATS;
    parserCache.init(reuseCache && this);
    this.fire('startstylesheet');
    for (let ti, fn, tok; (ti = (tok = stream.grab()).id);) {
      try {
        if (ti === AT && (fn = atFuncs[tok.atName] || atAny)) {
          fn.call(this, stream, tok);
        } else if (ti === CDCO) {
          // Skipping cruft
        } else if (!atAny) {
          stream.unget();
          break;
        } else if (!this._styleRule(stream, tok) && stream.grab().id) {
          stream._failure();
        }
      } catch (ex) {
        if (ex === ATS_GLOBAL) {
          break;
        }
        if (ex instanceof ParseError && !opts.strict) {
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
    if (this.options.strict) throw new ParseError('Unknown rule: ' + start, start);
    stream.skipDeclBlock();
  }

  //#endregion
  //#region Parser selectors

  /**
   * Warning! The next token is consumed
   * @param {TokenStream} stream
   * @param {Token} [tok]
   * @param {boolean} [relative]
   * @param {boolean} [lax]
   * @return {TokenValue<TokenSelector>[]|void}
   */
  _selectorsGroup(stream, tok, relative, lax) {
    const selectors = [];
    let comma;
    while ((tok = this._selector(stream, tok, relative)) || lax) {
      if (tok) selectors.push(tok);
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
      mods.push(SELECTORS[AMP](stream, tok));
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
      const fn = SELECTORS[tok.id];
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
    // This may be a selector, so we can't report errors upstream yet
    const events = !inParens && !isCust && (ti3 === IDENT || ti3 === FUNCTION)
      && (this._events = []);
    const end = isCust ? TT.propCustomEnd : inParens ? TT.propValEndParen : TT.propValEnd;
    const expr = this._expr(stream, end, isCust);
    const t = stream.token;
    const value = expr || isCust && TokenValue.empty(t);
    const brace = !inParens && t.id === LBRACE;
    if (events) {
      this._events = null;
      if (brace) {
        stream.source.reset(t2mark);
        stream._resetBuf();
        return;
      }
      for (const v of events) this.fire(...v);
    }
    if (brace) {
      stream._pair = RBRACE;
      throw new ParseError(`Unexpected "{" in "${tok}" declaration`, t);
      // TODO: if not as rare as alleged, make a flat array in _expr() and reuse it
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
    while ((ti = (tok = stream.get(UVAR, 0)).id) && !(isEndMap ? end[ti] : end === ti)) {
      if ((endParen = Parens[ti])) {
        if (!dumb && ti === LBRACE && parts.length) break;
        tok.expr = this._expr(stream, endParen, dumb);
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
          if (tok.code === 110/*n*/) tok.isNone = true;
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
      if (!this._inScope
      && !this._inStyle
      && (stream._amp > amps || sels.some(isRelativeSelector))) {
        this.alarm(2, 'Nested selector must be inside a style rule.', tok);
      }
      brace = stream.matchSmart(LBRACE, OrDieReusing);
      blk = canCache && parserCache.startBlock(sels[0]);
      const msg = {selectors: sels};
      const opts2 = {brace, decl: true, event: ['rule', msg]};
      this._block(stream, sels[0], opts ? assign({}, opts, opts2) : opts2);
      if (blk && !msg.empty) blk = (parserCache.endBlock(), 0);
    } catch (ex) {
      if (this.options.strict || !(ex instanceof ParseError)) throw ex;
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
    for (let prevTok, tok, ti, fn; (ti = (tok = stream.get(UVAR, false)).id) !== RBRACE;) {
      if (!ti) stream._failure('}');
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
            ATS[fn] ||
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
        if (this.options.strict || !(ex instanceof ParseError)) break;
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

export default Parser;
