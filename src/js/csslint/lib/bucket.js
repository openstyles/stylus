import NamedColors from './named-colors';
import {isOwn} from './util';

/** Much faster than flat array or regexp */
export default class Bucket {
  constructor(src) {
    this.addFrom(src);
  }

  /**
   * @param {string|string[]} src - length < 100
   * @return {Bucket}
   */
  addFrom(src) {
    for (let str of typeof src === 'string' ? [src] : src) {
      let c = (str = str.toLowerCase()).charCodeAt(0);
      if (c === 34 /* " */) c = (str = str.slice(1, -1)).charCodeAt(0);
      src = this[c = c * 100 + str.length];
      if (src == null) this[c] = str;
      else if (typeof src === 'string') this[c] = [src, str];
      else src.push(str);
    }
    return this;
  }

  /** @return {string} */
  join(sep) {
    let res = '';
    for (const v of Object.values(this)) {
      res += `${res ? sep : ''}${typeof v === 'string' ? v : v.join(sep)}`;
    }
    return res;
  }

  /**
   * @param {Token} tok
   * @param {number} [c] - first char code
   * @param {string} [lowText] - text to use instead of token's text
   * @return {boolean | any}
   */
  has(tok, c = tok.code, lowText) {
    const len = (lowText || tok).length;
    if (!isOwn(this, c = c * 100 + len)) return false;
    if (len === 1) return true;
    const val = this[c];
    const low = lowText || (tok.lowText ??= tok.text.toLowerCase());
    return typeof val === 'string' ? val === low : val.includes(low);
  }
}

export const B = /** @type {{[key:string]: Bucket}} */ {
  attrIS: ['i', 's', ']'], // "]" is to improve the error message,
  colors: NamedColors,
  marginSyms: (map => 'B-X,B-L-C,B-L,B-R-C,B-R,L-B,L-M,L-T,R-B,R-M,R-T,T-X,T-L-C,T-L,T-R-C,T-R'
    .replace(/[A-Z]/g, s => map[s]).split(',')
  )({B: 'bottom', C: 'corner', L: 'left', M: 'middle', R: 'right', T: 'top', X: 'center'}),
};

for (const k in B) B[k] = new Bucket(B[k]);
for (const k of 'and,andOr,auto,autoNone,evenOdd,fromTo,important,layer,n,none,not,notOnly,of,or,to'
  .split(',')) B[k] = new Bucket(k.split(/(?=[A-Z])/)); // splitting by an Uppercase A-Z letter
