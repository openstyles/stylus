import {COLOR_HEX, COLOR_HSL, COLOR_HSV, COLOR_HWB, COLOR_RGB} from '@/js/consts';
import {kHexUppercase} from './util';

const ALPHA_DIGITS = 3;
const mathRound = Math.round;
const RX_ANGLE = /(?:deg|y?rad|turn|)$/;
const ANGLE_TO_DEG = {
  __proto__: null,
  grad: 360 / 400,
  rad: 180 / Math.PI,
  turn: 360,
};
const TO_HSV = [null];
const FROM_HSV = [null];
export const fromHSV = (color, type) => FROM_HSV[type](color);
export const toHSV = color => TO_HSV[color.type || COLOR_RGB](color);
export const constrain = (min, max, value) => value < min ? min : value > max ? max : value;
export const constrainHue = x => x < 0 ? x % 360 + 360 : x >= 360 ? x % 360 : x;

TO_HSV[COLOR_HEX] = RGBtoHSV;
TO_HSV[COLOR_RGB] = RGBtoHSV;
TO_HSV[COLOR_HSL] = HSLtoHSV;
TO_HSV[COLOR_HWB] = HWBtoHSV;

FROM_HSV[COLOR_HEX] = HSVtoRGB;
FROM_HSV[COLOR_RGB] = HSVtoRGB;
FROM_HSV[COLOR_HSL] = HSVtoHSL;
FROM_HSV[COLOR_HWB] = HSVtoHWB;

/**
 * @param {Color|string} color
 * @param {Color['type']} [type]
 * @param {{}} [cfg]
 * @return {string}
 */
export function format(color = '', type = color.type, {[kHexUppercase]: upper, uso, round} = {}) {
  if (!color || !type)
    return typeof color === 'string' ? color : '';
  const {a, type: src} = color;
  const hasA = !uso && a >= 0 && a < 1;
  const toHex = type === COLOR_HEX;
  const srcConv = src === COLOR_HEX ? COLOR_RGB : src;
  const dstConv = toHex ? COLOR_RGB : type;
  if (srcConv !== dstConv)
    color = FROM_HSV[dstConv](TO_HSV[srcConv](color));
  let aa;
  let {x, y, z} = color;
  if (round || toHex || type === COLOR_RGB) {
    x = mathRound(x);
    y = mathRound(y);
    z = mathRound(z);
  }
  if (toHex) {
    aa = hasA ? mathRound(a * 255) : 0;
    type = uso || x % 0x11 || y % 0x11 || z % 0x11 || aa % 0x11;
    color = type ? 0x100000000 + x * 0x1000000/* << goes negative*/ + (y << 16) + (z << 8) + aa
      : 0x10000 + (x / 0x11 << 12) + (y / 0x11 << 8) + (z / 0x11 << 4) + aa / 0x11;
    color = '#' + color.toString(16).slice(1, hasA ? undefined : type ? -2 : -1);
    if ((upper ?? color.mod) && (
      x & 15 > 9 || x >= 160 ||
      y & 15 > 9 || y >= 160 ||
      z & 15 > 9 || z >= 160 ||
      hasA && (aa & 15 > 9 || aa >= 160)
    )) color = color.toUpperCase();
    return color;
  }
  if (uso)
    return `${x}, ${y}, ${z}`;
  const slash = color.mod && ' / ';
  const sep = slash ? ' ' : ', ';
  aa = hasA && formatAlpha(a) || '';
  aa &&= (slash || sep) + aa;
  if (type === COLOR_RGB) {
    return (aa ? 'rgba(' : 'rgb(') + x + sep + y + sep + z + aa + ')';
  }
  if (type === COLOR_HWB) {
    return `hwb(${x} ${y}% ${z}%${aa})`;
  }
  if (type === COLOR_HSL) {
    return (aa ? 'hsla(' : 'hsl(') + x + sep + y + '%' + sep + z + '%' + aa + ')';
  }
  return '';
}

export function parse(s, len = typeof s === 'string' && (s = s.trim()).length) {
  if (!len)
    return;
  let i;
  let v = s;
  s = s.toLowerCase();
  if (s.charCodeAt(0) === 35/* # */) {
    const lowerCase = v === s;
    v = (len === 4 || len === 5 || len === 7 || len === 9) && parseHex(s, len);
    if (v) v.lowerCase = +lowerCase;
    return v;
  }
  if (s.charCodeAt(s.length - 1) !== 41/*)*/) {
    v = NAMED_COLORS.get(s);
    if (+v) NAMED_COLORS.set(s, v = {
      type: COLOR_HEX,
      x: v >> 16,
      y: (v >> 8) & 255,
      z: v & 255,
      a: undefined,
      mod: undefined,
    });
    return v;
  }
  let type;
  i = s.charCodeAt(3);
  if ((i = i === 40/*(*/ ? 4 : i === 97/*a*/ && s.charCodeAt(4) === 40/*(*/ && 5)
  && (type = (v = s.charCodeAt(0)) === 114/* r */
    ? s.charCodeAt(1) === 103/* g */ && s.charCodeAt(2) === 98/* b */ && COLOR_RGB
    : v === 104/* x */ && (
      (v = s.charCodeAt(1)) === 115/* s */ ? s.charCodeAt(2) === 108/* l */ && COLOR_HSL
        : v === 119/* w */ && s.charCodeAt(2) === 98/* b */ && COLOR_HWB
    ))
  && (s = s.slice(i, -1).trim())) {
    return parseFunc(type, s);
  }
}

/**
 * @param {string} str
 * @param {number} len - must be already validated
 * @return {Color|void}
 */
function parseHex(str/*lowercase*/, len) {
  for (let i = 1, rgb = 0, alpha, c; ;) {
    c = str.charCodeAt(i);
    if ((c -= 48) >= 0 && c <= 9 || (c -= 39) >= 10 && c <= 15) {
      if (i === 7) alpha = c;
      else if (i === 8) alpha = (alpha << 4 | c) / 255;
      else if (i === 4 && len < 7) alpha = c * 0x11 / 255;
      else rgb = rgb << 4 | c;
      if (++i === len) {
        return {
          type: COLOR_HEX,
          x: len < 7 ? (rgb >> 8) * 0x11 : rgb >> 16,
          y: len < 7 ? (rgb >> 4 & 15) * 0x11 : rgb >> 8 & 255,
          z: len < 7 ? (rgb & 15) * 0x11 : rgb & 255,
          a: alpha,
        };
      }
    } else break;
  }
}

function parseFunc(type, val) {
  let sA, x, y, z, a, pct, units;
  x = val.indexOf('/');
  if (x > 0) {
    sA = val.slice(x + 1);
    val = val.slice(0, x).trim();
  }
  const rgb = type === COLOR_RGB;
  const hwb = type === COLOR_HWB;
  const mod = hwb || ~x || !val.includes(',') ? 1 : 0;
  const parts = val.split(mod ? /\s+/ : /\s*,\s*/);
  const len = parts.length;
  const [s1, s2, s3] = parts;
  if (
    !(x > 0 ? len === 3 : len === 3 || len === 4 && (sA = parts[3])) ||
    isNaN(x = hwb && s1 === 'none' ? 0 :
      (val = s1.charCodeAt(s1.length - 1), rgb)
        ? ((pct = val === 37)) ? +s1.slice(0, -1) : +s1
        : (/*dgn*/val === 100 || val === 103 || val === 110) && (units = RX_ANGLE.exec(s1)[0])
          ? +s1.slice(0, -units.length)
          : +s1) ||
    isNaN(y = hwb && s2 === 'none' ? 0 :
      (y = s2.charCodeAt(s2.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        y ? +s2.slice(0, -1) : +s2) ||
    isNaN(z = hwb && s3 === 'none' ? 0 :
      (z = s3.charCodeAt(s3.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        z ? +s3.slice(0, -1) : +s3) ||
    sA != null && !(hwb && sA === 'none') &&
    isNaN(a = (sA = sA.trim()).charCodeAt(sA.length - 1) === 37 ? +sA.slice(0, -1) / 100 : +sA)
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
  return {type, x, y, z, a, mod};
}

export const formatAlpha = (a, precision = ALPHA_DIGITS) =>
  a <= 0 ? '0' : // clamping per CSS spec
    a >= 1 ? '1' : // clamping per CSS spec
      a > 0 && a < 1 // excluding NaN and undefined
        ? (precision = +a.toFixed(precision)) && precision < 1 ? '' + precision
        : '' + a // the original value that exceeds precision e.y. 0.0001, 0.9995
      : '';

function RGBtoHSV({x, y, z, a, mod}) {
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
  return {
    type: COLOR_HSV,
    x: constrainHue(x),
    y: MaxC === 0 ? 0 : DeltaC / MaxC,
    z: MaxC,
    a,
    mod,
  };
}

function HSVtoRGB({x, y, z, a, mod}) {
  x = constrainHue(x);
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
  return {
    type: COLOR_RGB,
    x: (x + m) * 255,
    y: (y + m) * 255,
    z: (z + m) * 255,
    a,
    mod,
  };
}


function HSLtoHSV({x, y, z, a, mod}) {
  const t = y * (z < 50 ? z : 100 - z) / 100;
  return {
    type: COLOR_HSV,
    x: constrainHue(x),
    y: t + z ? 200 * t / (t + z) / 100 : 0,
    z: (t + z) / 100,
    a,
    mod,
  };
}

function HSVtoHSL({x, y, z, a, mod}) {
  const l = (2 - y) * z / 2;
  const t = l < .5 ? l * 2 : 2 - l * 2;
  return {
    type: COLOR_HSL,
    x: constrainHue(x),
    y: t ? y * z / t * 100 : 0,
    z: l * 100,
    a,
    mod,
  };
}

function HWBtoHSV({x, y, z, a, mod}) {
  y = y < 0 ? 0 : y > 100 ? 1 : y / 100;
  z = z < 0 ? 0 : z > 100 ? 1 : z / 100;
  return {
    type: COLOR_HSV,
    x: constrainHue(x),
    y: z === 1 ? 0 : 1 - y / (1 - z),
    z: 1 - z,
    a,
    mod,
  };
}

function HSVtoHWB({x, y, z, a, mod}) {
  return {
    type: COLOR_HWB,
    x: constrainHue(x),
    y: (1 - y) * z * 100,
    z: (1 - z) * 100,
    a,
    mod,
  };
}

export const NAMED_COLORS = /*@__PURE__*/new Map([
  ['transparent', {type: COLOR_RGB, x: 0, y: 0, z: 0, a: 0, mod: undefined}],
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
