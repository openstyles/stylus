import Matcher from './matcher';
import Properties from './properties';
import ScopedProperties from './scoped-properties';
import {clipString} from './util';
import VTComplex from './validation-complex';
import {buGlobalKeywords} from './validation-simple';

const validationCache = new Map();

/** @property {Array} [badFunc] */
export class PropValueIterator {
  /** @param {TokenValue} value */
  constructor(value) {
    this.i = 0;
    this.parts = value.parts;
    this.value = value;
  }

  get hasNext() {
    return this.i + 1 < this.parts.length;
  }

  /** @returns {?Token} */
  next() {
    if (this.i < this.parts.length) return this.parts[++this.i];
  }
}

class ValidationError extends Error {
  constructor(message, pos) {
    super();
    this.col = pos.col;
    this.line = pos.line;
    this.offset = pos.offset;
    this.message = message;
  }
}

/**
 * @param {Token} tok
 * @param {TokenValue} value
 * @param {TokenStream} stream
 * @param {string|Object} Props
 * @return {ValidationError|void}
 */
export function validateProperty(tok, value, stream, Props) {
  const pp = value.parts;
  const p0 = pp[0];
  Props = typeof Props === 'string' ? ScopedProperties[Props] : Props || Properties;
  let spec, res, vp;
  let prop = tok.lowText ??= tok.text.toLowerCase();
  do {
    spec = Props[prop] || Props['<all>'] && (Props = Properties)[prop];
  } while (!spec && !res && (vp = tok.vendorPos) && (res = prop = prop.slice(vp)));
  if (typeof spec === 'number' || !spec && vp) {
    return;
  }
  if (!spec) {
    prop = Props === Properties || !Properties[prop] ? 'Unknown' : 'Misplaced';
    return new ValidationError(`${prop} property "${tok}".`, tok);
  }
  if (value.isVar) {
    return;
  }
  if (p0.type === 'ident' && buGlobalKeywords.has(p0)) {
    return pp[1] && vtFailure(pp[1], true);
  }
  const valueSrc = value.text.trim();
  let known = validationCache.get(prop);
  if (known && known.has(valueSrc)) {
    return;
  }
  // Property-specific validation.
  const expr = new PropValueIterator(value);
  let m = Matcher.cache[spec] || Matcher.parse(spec);
  res = m.match(expr, p0);
  if ((!res || expr.hasNext) && /\battr\(/i.test(valueSrc)) {
    if (!res) {
      expr.i = 0;
      expr.tryAttr = true;
      res = m.match(expr);
    }
    for (let i, epp = expr.parts; (i = expr.i) < epp.length && epp[i].isAttr;) {
      expr.next();
    }
  }
  if (expr.hasNext && (res || expr.i)) return vtFailure(expr.parts[expr.i]);
  if (!res && (m = expr.badFunc)) return vtFailure(m[0], vtDescribe(spec, m[1]));
  if (!res) return vtFailure(expr.value, vtDescribe(spec));
  if (!known) validationCache.set(prop, (known = new Set()));
  known.add(valueSrc);
}

function vtDescribe(type, m) {
  if (!m) m = VTComplex[type] || type[0] === '<' && Properties[type.slice(1, -1)];
  return m instanceof Matcher ? m.toString(0) : vtExplode(m || type);
}

export function vtExplode(text) {
  return !text.includes('<') ? text
    : (Matcher.cache[text] || Matcher.parse(text)).toString(0);
}

function vtFailure(unit, what) {
  if (!what || what === true ? (what = 'end of value') : !unit.isVar) {
    return new ValidationError(`Expected ${what} but found "${clipString(unit)}".`, unit);
  }
}
