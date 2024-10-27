import {B} from './bucket';
import {TokenFunc} from './token';
import {OrDie, OrDieReusing, TT} from './token-stream';
import {
  COLON, COMMA, IDENT, LBRACE, LPAREN, PCT, RBRACE, RPAREN, SEMICOLON, STRING,
} from './tokens';
import {pick} from './util';

/** Functions for @ symbols */
const ATS = {
  __proto__: null,

  /**
   * @this {Parser}
   * @param {TokenStream} stream
   * @param {Token} start
   */
  charset(stream, start) {
    const charset = stream.matchSmart(STRING, OrDie);
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
          throw ATS_GLOBAL;
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
        a = this._selectorsGroup(stream, undefined, false, true);
        stream.matchSmart(RPAREN, OrDieReusing);
        tok = stream.grab();
      }
      if (a && B.to.has(tok)) {
        stream.matchSmart(LPAREN, OrDie);
        b = this._selectorsGroup(stream, undefined, false, true);
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
export const ATS_TDO = pick(ATS, ['document']);

/** @-rules at the top level of the stylesheet */
export const ATS_GLOBAL = pick(ATS, ['charset', 'import', 'layer', 'namespace']);

export default ATS;
