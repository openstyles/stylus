import {B} from './bucket';
import {TokenFunc} from './token';
import {OrDie, OrDieReusing, TT} from './token-stream';
import {COLON, IDENT, PIPE, RBRACKET, RPAREN, STAR, TokenIdByCode, WS} from './tokens';
import {assign, isOwn} from './util';

const textToTokenMap = obj => Object.keys(obj).reduce((res, k) =>
  (((res[TokenIdByCode[k.charCodeAt(0)]] = obj[k]), res)), []);

/** Functions for selectors */
const SELECTORS = textToTokenMap({

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
    let expr, n, x, lax;
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
      if (n === 'not' || (lax = n === 'is' || n === 'where' || n === 'any') || n === 'has') {
        x = this._selectorsGroup(stream, undefined, n === 'has', lax);
        if (!x) stream._failure('a selector');
        if (expr) expr.push(...x); else expr = x;
        stream.matchSmart(RPAREN, OrDieReusing);
      } else if (!x) {
        expr = this._expr(stream, RPAREN, true);
      }
      tok = TokenFunc.from(tok, expr, stream.token);
      stream._pair = 0;
    }
    tok.args = expr && expr.parts || [];
    return tok;
  },
});

export default SELECTORS;
