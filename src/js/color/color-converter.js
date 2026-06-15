import {
  BIT_COLOR_COMMA, BIT_COLOR_NAME_A, BIT_COLOR_NONE_A, BIT_COLOR_NONE_X, BIT_COLOR_NONE_Y,
  BIT_COLOR_NONE_Z, BIT_COLOR_PCT_A, BIT_COLOR_PCT_X, BIT_COLOR_PCT_Y, BIT_COLOR_PCT_Z, COLOR_HEX,
  COLOR_HSL, COLOR_HSV, COLOR_HWB, COLOR_RGB, HEX_RETAIN_CASE, kHexUppercase,
} from '@/js/consts';

const ALPHA_DIGITS = 3;
const mathRound = Math.round;
const RX_ANGLE = /(?:deg|y?rad|turn|)$/;
const ANGLE_TO_DEG = {
  __proto__: null,
  grad: 360 / 400,
  rad: 180 / Math.PI,
  turn: 360,
};
export const constrain = (min, max, value) => value < min ? min : value > max ? max : value;
export const constrainHue = x => x < 0 ? x % 360 + 360 : x >= 360 ? x % 360 : x;

class Color {
  /**
   * @param {number} type
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {?number} a
   * @param {?number} mod - hex: uppercase 1|0, others: space 1|0 + alpha pct 2|0 + rgb-pct 4|0
   */
  constructor(type, x, y, z, a, mod) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.z = z;
    this.a = a;
    this.mod = mod;
  }

  /**
   * @param {number} [type]
   * @param {{}} [cfg]
   * @return {string}
   */
  toString(type, {[kHexUppercase]: upper, uso, round} = {}) {
    type ||= this.type;
    const {a, mod, type: src} = this;
    const hex = type === COLOR_HEX;
    const rgb = type === COLOR_RGB;
    const comma = mod & BIT_COLOR_COMMA;
    const sep = comma || uso ? ', ' : ' ';
    const srcConv = src === COLOR_HEX ? COLOR_RGB : src;
    const dstConv = hex ? COLOR_RGB : type;
    let color = srcConv === dstConv ? this : this.to(dstConv);
    let aa, pctX, pctY, pctZ, pctA;
    let {x, y, z} = color;
    if (hex || uso) {
      x = mathRound(x);
      y = mathRound(y);
      z = mathRound(z);
    } else {
      x = !x && mod & BIT_COLOR_NONE_X ? 'none' : (
        (pctX = mod & BIT_COLOR_PCT_X) && rgb && (x /= 2.55),
        round || rgb && comma ? mathRound(x) : x
      );
      y = !y && mod & BIT_COLOR_NONE_Y ? 'none' : (
        (pctY = mod & BIT_COLOR_PCT_Y) && rgb && (y /= 2.55),
        round || rgb && comma ? mathRound(y) : y
      );
      z = !z && mod & BIT_COLOR_NONE_Z ? 'none' : (
        (pctZ = mod & BIT_COLOR_PCT_Z) && rgb && (z /= 2.55),
        round || rgb && comma ? mathRound(z) : z
      );
      aa = a <= 0 ? mod & BIT_COLOR_NONE_A ? 'none' : '0' : (
        !(a < 1)/* negating to handle undefined and NaN */ ? '' : (
          aa = ((pctA = mod & BIT_COLOR_PCT_A)) ? a * 100 : a,
          round || rgb && comma ? pctA ? mathRound(aa) : formatAlpha(aa) : aa
        )
      );
    }
    if (uso) {
      color = x + sep + y + sep + z;
    } else if (hex) {
      aa = a < 1 ? mathRound(a * 255) : 255;
      type = uso || x % 0x11 || y % 0x11 || z % 0x11 || aa % 0x11;
      color = type ? 0x100000000 + x * 0x1000000/* << goes negative*/ + (y << 16) + (z << 8) + aa
        : 0x10000 + (x / 0x11 << 12) + (y / 0x11 << 8) + (z / 0x11 << 4) + aa / 0x11;
      color = '#' + color.toString(16).slice(1, a < 1 ? undefined : type ? -2 : -1);
      if ((upper == null || upper === HEX_RETAIN_CASE ? mod : upper) && (
        x & 15 > 9 || x >= 160 ||
        y & 15 > 9 || y >= 160 ||
        z & 15 > 9 || z >= 160 ||
        a < 1 && (aa & 15 > 9 || aa >= 160)
      )) color = color.toUpperCase();
    } else if ((
      color = type === COLOR_RGB ? 'rgb'
        : type === COLOR_HSL ? 'hsl'
          : type === COLOR_HWB ? 'hwb'
            : ''
    )) {
      color +=
        (mod & BIT_COLOR_NAME_A ? 'a(' : '(') +
        x + (pctX ? '%' : '') + sep +
        y + (pctY ? '%' : '') + sep +
        z + (pctZ ? '%' : '') + (aa && (comma ? sep : ' / ')) +
        aa + (aa && pctA ? '%' : '') + ')';
    }
    return color;
  }

  /**
   * @param {string} str
   * @param {number} [len]
   * @param {boolean} [hex]
   * @return {Color|void}
   */
  static parse(str, len = typeof str === 'string' && (str = str.trim()).length, hex) {
    if (!len)
      return;
    let i, v;
    v = str;
    str = str.toLowerCase();
    if (hex ?? str.charCodeAt(0) === 35/* # */) {
      const isUpperCase = v !== str;
      v = len === 4 || len === 5 || len === 7 || len === 9;
      return v ? parseHex(str, len, isUpperCase) : undefined;
    }
    if (str.charCodeAt(str.length - 1) !== 41/*)*/) {
      v = NAMED_COLORS.get(str);
      if (+v) NAMED_COLORS.set(str, v = new Color(COLOR_HEX, v >> 16, (v >> 8) & 255, v & 255));
      return v;
    }
    let type, a;
    i = str.charCodeAt(3);
    if ((i = i === 40/*(*/ ? 4 : (a = i === 97/*a*/) && str.charCodeAt(4) === 40/*(*/ && 5)
      && (type = (v = str.charCodeAt(0)) === 114/* r */
        ? str.charCodeAt(1) === 103/* g */ && str.charCodeAt(2) === 98/* b */ && COLOR_RGB
        : v === 104/* x */ && (
        (v = str.charCodeAt(1)) === 115/* s */ ? str.charCodeAt(2) === 108/* l */ && COLOR_HSL
          : v === 119/* w */ && str.charCodeAt(2) === 98/* b */ && COLOR_HWB
        ))
      && (str = str.slice(i, -1).trim())) {
      return parseColorFunc(type, str, a);
    }
  }

  /**
   * @param {number} [type=COLOR_RGB]
   * @return {Color}
   */
  to(type) {
    if (type === this.type)
      return this;
    let res = this.type !== COLOR_HSV && this.toHSV();
    let {x, y, z} = res || this;
    x = constrainHue(x);
    if (type === COLOR_HSL) {
      const l = (2 - y) * z / 2;
      const t = l < .5 ? l * 2 : 2 - l * 2;
      y = t ? y * z / t * 100 : 0;
      z = l * 100;
    } else if (type === COLOR_HWB) {
      y = (1 - y) * z * 100;
      z = (1 - z) * 100;
    } else {
      const C = y * z;
      const V = C * (1 - Math.abs((x / 60) % 2 - 1));
      const m = z - C;
      z = x < 60 ? (x = C, y = V, 0) :
        x < 120 ? (x = V, y = C, 0) :
        x < 180 ? (x = 0, y = C, V) :
        x < 240 ? (x = 0, y = V, C) :
        x < 300 ? (x = V, y = 0, C) :
        x < 360 ? (x = C, y = 0, V) :
          (x = y = NaN);
      x = (x + m) * 255;
      y = (y + m) * 255;
      z = (z + m) * 255;
    }
    if (res) {
      res.x = x;
      res.y = y;
      res.z = z;
    } else {
      res = new Color(type, x, y, z, this.a, this.mod);
    }
    return res;
  }

  toHSV() {
    let {type, x, y, z, a, mod} = this;
    if (type === COLOR_HSL) {
      const t = y * (z < 50 ? z : 100 - z) / 100;
      y = t + z ? 200 * t / (t + z) / 100 : 0;
      z = (t + z) / 100;
    } else if (type === COLOR_HWB) {
      y = y < 0 ? 0 : y > 100 ? 1 : y / 100;
      z = z < 0 ? 0 : z > 100 ? 1 : z / 100;
      y = z === 1 ? 0 : 1 - y / (1 - z);
      z = 1 - z;
    } else {
      x /= 255;
      y /= 255;
      z /= 255;
      const MaxC = Math.max(x, y, z);
      const MinC = Math.min(x, y, z);
      const DeltaC = MaxC - MinC;
      x =
        DeltaC === 0 ? 0 :
          MaxC === x ? 60 * (((y - z) / DeltaC) % 6) :
            MaxC === y ? 60 * (((z - x) / DeltaC) + 2) :
              MaxC === z ? 60 * (((x - y) / DeltaC) + 4) :
                0;
      y = MaxC === 0 ? 0 : DeltaC / MaxC;
      z = MaxC;
    }
    return new Color(COLOR_HSV, constrainHue(x), y, z, a, mod);
  }
}

/**
 * @param {string} str
 * @param {number} len - must be already validated
 * @param {any} isUpperCase
 * @return {Color|void}
 */
function parseHex(str/*lowercase*/, len, isUpperCase) {
  for (let i = 1, rgb = 0, alpha, c; ;) {
    c = str.charCodeAt(i);
    if ((c -= 48) >= 0 && c <= 9 || (c -= 39) >= 10 && c <= 15) {
      if (i === 7) alpha = c;
      else if (i === 8) alpha = (alpha << 4 | c) / 255;
      else if (i === 4 && len < 7) alpha = c * 0x11 / 255;
      else rgb = rgb << 4 | c;
      if (++i === len) {
        return new Color(
          COLOR_HEX,
          len < 7 ? (rgb >> 8) * 0x11 : rgb >> 16,
          len < 7 ? (rgb >> 4 & 15) * 0x11 : rgb >> 8 & 255,
          len < 7 ? (rgb & 15) * 0x11 : rgb & 255,
          alpha,
          +isUpperCase,
        );
      }
    } else break;
  }
}

/**
 * @param {number} type
 * @param {string} val
 * @param {number} [mod]
 * @return {Color|void}
 */
export function parseColorFunc(type, val, mod = 0) {
  let sA, x, y, z, a, v, pct, units;
  const rgb = type === COLOR_RGB;
  const slash = val.indexOf('/') + 1;
  const space = slash || type === COLOR_HWB || !val.includes(',');
  if (slash) {
    sA = val.slice(slash);
    val = val.slice(0, slash - 1).trim();
  }
  if (mod) mod |= BIT_COLOR_NAME_A;
  if (!space) mod |= BIT_COLOR_COMMA;
  const parts = val.split(space ? /\s+/ : /\s*,\s*/);
  const len = parts.length;
  const [s1, s2, s3] = parts;
  if (
    !(slash ? len === 3 : len === 3 || len === 4 && (sA = parts[3])) ||
    isNaN(x = space && s1 === 'none' ? (mod |= BIT_COLOR_NONE_X, 0) :
      (v = s1.charCodeAt(s1.length - 1), rgb)
        ? ((pct = v === 37)) ? (mod |= BIT_COLOR_PCT_X, +s1.slice(0, -1)) : +s1
        : (/*dgn*/v === 100 || v === 103 || v === 110) && (units = RX_ANGLE.exec(s1)[0])
          ? +s1.slice(0, -units.length)
          : +s1
    ) ||
    isNaN(y = space && s2 === 'none' ? (mod |= BIT_COLOR_NONE_X, 0) :
      (y = s2.charCodeAt(s2.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        y ? (mod |= BIT_COLOR_PCT_Y, +s2.slice(0, -1)) : +s2
    ) ||
    isNaN(z = space && s3 === 'none' ? (mod |= BIT_COLOR_NONE_X, 0) :
      (z = s3.charCodeAt(s3.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        z ? (mod |= BIT_COLOR_PCT_Z, +s3.slice(0, -1)) : +s3
    ) ||
    sA != null && !(slash && sA === 'none' && (mod |= BIT_COLOR_NONE_A)) &&
    isNaN(a = (sA = sA.trim()).charCodeAt(sA.length - 1) === 37
      ? (mod |= BIT_COLOR_PCT_A, +sA.slice(0, -1) / 100)
      : +sA)
  ) return;
  if (a < 0) a = 0; else if (a > 1) a = 1;
  if (rgb) {
    x = (x = pct ? x * 2.55 : x) < 0 ? 0 : x > 255 ? 255 : x;
    y = (y = pct ? y * 2.55 : y) < 0 ? 0 : y > 255 ? 255 : y;
    z = (z = pct ? z * 2.55 : z) < 0 ? 0 : z > 255 ? 255 : z;
  } else {
    if (units) x *= ANGLE_TO_DEG[units];
    if (y < 0) y = 0; else if (y > 100) y = 100;
    if (z < 0) z = 0; else if (z > 100) z = 100;
  }
  return new Color(type, x, y, z, a, mod);
}

export const formatAlpha = (a, precision = ALPHA_DIGITS) =>
  a <= 0 ? '0' : // clamping per CSS spec
    a >= 1 ? '1' : // clamping per CSS spec
      a > 0 && a < 1 // excluding NaN and undefined
        ? (precision = +a.toFixed(precision)) && precision < 1 ? '' + precision
        : '' + a // the original value that exceeds precision e.y. 0.0001, 0.9995
      : '';

export const NAMED_COLORS = /*@__PURE__*/new Map([
  ['transparent', new Color(COLOR_RGB, 0, 0, 0, 0)],
  ['aliceblue', 0xf0f8ff],
  ['antiquewhite', 0xfaebd7],
  ['aqua', 0x00ffff],
  ['aquamarine', 0x7fffd4],
  ['azure', 0xf0ffff],
  ['beige', 0xf5f5dc],
  ['bisque', 0xffe4c4],
  ['black', 0x000000],
  ['blanchedalmond', 0xffebcd],
  ['blue', 0x0000ff],
  ['blueviolet', 0x8a2be2],
  ['brown', 0xa52a2a],
  ['burlywood', 0xdeb887],
  ['cadetblue', 0x5f9ea0],
  ['chartreuse', 0x7fff00],
  ['chocolate', 0xd2691e],
  ['coral', 0xff7f50],
  ['cornflowerblue', 0x6495ed],
  ['cornsilk', 0xfff8dc],
  ['crimson', 0xdc143c],
  ['cyan', 0x00ffff],
  ['darkblue', 0x00008b],
  ['darkcyan', 0x008b8b],
  ['darkgoldenrod', 0xb8860b],
  ['darkgray', 0xa9a9a9],
  ['darkgrey', 0xa9a9a9],
  ['darkgreen', 0x006400],
  ['darkkhaki', 0xbdb76b],
  ['darkmagenta', 0x8b008b],
  ['darkolivegreen', 0x556b2f],
  ['darkorange', 0xff8c00],
  ['darkorchid', 0x9932cc],
  ['darkred', 0x8b0000],
  ['darksalmon', 0xe9967a],
  ['darkseagreen', 0x8fbc8f],
  ['darkslateblue', 0x483d8b],
  ['darkslategray', 0x2f4f4f],
  ['darkslategrey', 0x2f4f4f],
  ['darkturquoise', 0x00ced1],
  ['darkviolet', 0x9400d3],
  ['deeppink', 0xff1493],
  ['deepskyblue', 0x00bfff],
  ['dimgray', 0x696969],
  ['dimgrey', 0x696969],
  ['dodgerblue', 0x1e90ff],
  ['firebrick', 0xb22222],
  ['floralwhite', 0xfffaf0],
  ['forestgreen', 0x228b22],
  ['fuchsia', 0xff00ff],
  ['gainsboro', 0xdcdcdc],
  ['ghostwhite', 0xf8f8ff],
  ['gold', 0xffd700],
  ['goldenrod', 0xdaa520],
  ['gray', 0x808080],
  ['grey', 0x808080],
  ['green', 0x008000],
  ['greenyellow', 0xadff2f],
  ['honeydew', 0xf0fff0],
  ['hotpink', 0xff69b4],
  ['indianred', 0xcd5c5c],
  ['indigo', 0x4b0082],
  ['ivory', 0xfffff0],
  ['khaki', 0xf0e68c],
  ['lavender', 0xe6e6fa],
  ['lavenderblush', 0xfff0f5],
  ['lawngreen', 0x7cfc00],
  ['lemonchiffon', 0xfffacd],
  ['lightblue', 0xadd8e6],
  ['lightcoral', 0xf08080],
  ['lightcyan', 0xe0ffff],
  ['lightgoldenrodyellow', 0xfafad2],
  ['lightgray', 0xd3d3d3],
  ['lightgrey', 0xd3d3d3],
  ['lightgreen', 0x90ee90],
  ['lightpink', 0xffb6c1],
  ['lightsalmon', 0xffa07a],
  ['lightseagreen', 0x20b2aa],
  ['lightskyblue', 0x87cefa],
  ['lightslategray', 0x778899],
  ['lightslategrey', 0x778899],
  ['lightsteelblue', 0xb0c4de],
  ['lightyellow', 0xffffe0],
  ['lime', 0x00ff00],
  ['limegreen', 0x32cd32],
  ['linen', 0xfaf0e6],
  ['magenta', 0xff00ff],
  ['maroon', 0x800000],
  ['mediumaquamarine', 0x66cdaa],
  ['mediumblue', 0x0000cd],
  ['mediumorchid', 0xba55d3],
  ['mediumpurple', 0x9370db],
  ['mediumseagreen', 0x3cb371],
  ['mediumslateblue', 0x7b68ee],
  ['mediumspringgreen', 0x00fa9a],
  ['mediumturquoise', 0x48d1cc],
  ['mediumvioletred', 0xc71585],
  ['midnightblue', 0x191970],
  ['mintcream', 0xf5fffa],
  ['mistyrose', 0xffe4e1],
  ['moccasin', 0xffe4b5],
  ['navajowhite', 0xffdead],
  ['navy', 0x000080],
  ['oldlace', 0xfdf5e6],
  ['olive', 0x808000],
  ['olivedrab', 0x6b8e23],
  ['orange', 0xffa500],
  ['orangered', 0xff4500],
  ['orchid', 0xda70d6],
  ['palegoldenrod', 0xeee8aa],
  ['palegreen', 0x98fb98],
  ['paleturquoise', 0xafeeee],
  ['palevioletred', 0xdb7093],
  ['papayawhip', 0xffefd5],
  ['peachpuff', 0xffdab9],
  ['peru', 0xcd853f],
  ['pink', 0xffc0cb],
  ['plum', 0xdda0dd],
  ['powderblue', 0xb0e0e6],
  ['purple', 0x800080],
  ['rebeccapurple', 0x663399],
  ['red', 0xff0000],
  ['rosybrown', 0xbc8f8f],
  ['royalblue', 0x4169e1],
  ['saddlebrown', 0x8b4513],
  ['salmon', 0xfa8072],
  ['sandybrown', 0xf4a460],
  ['seagreen', 0x2e8b57],
  ['seashell', 0xfff5ee],
  ['sienna', 0xa0522d],
  ['silver', 0xc0c0c0],
  ['skyblue', 0x87ceeb],
  ['slateblue', 0x6a5acd],
  ['slategray', 0x708090],
  ['slategrey', 0x708090],
  ['snow', 0xfffafa],
  ['springgreen', 0x00ff7f],
  ['steelblue', 0x4682b4],
  ['tan', 0xd2b48c],
  ['teal', 0x008080],
  ['thistle', 0xd8bfd8],
  ['tomato', 0xff6347],
  ['turquoise', 0x40e0d0],
  ['violet', 0xee82ee],
  ['wheat', 0xf5deb3],
  ['white', 0xffffff],
  ['whitesmoke', 0xf5f5f5],
  ['yellow', 0xffff00],
  ['yellowgreen', 0x9acd32],
]);

export default Color;
