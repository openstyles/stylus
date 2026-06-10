import {kHexUppercase} from './util';

export const ALPHA_DIGITS = 3;
const mathRound = Math.round;
// All groups in RXS_NUM must use ?: in order to enable \1 in RX_COLOR.rgb
const RXS_NUM = /\s*[+-]?(\.\d+|\d+(\.\d*)?)(e[+-]?\d+)?/.source.replace(/\(/g, '(?:');
const RXS_ANGLE = '(?:deg|g?rad|turn)?';
const RX_ANGLE = /(?:deg|g?rad|turn|)$/;
const expandRe = re => RegExp(re.source.replace(/N/g, RXS_NUM).replace(/A/g, RXS_ANGLE), 'iy');
export const RX_COLOR = {
  __proto__: null,
  hex: /#([a-f\d]{3}(?:[a-f\d](?:[a-f\d]{2}){0,2})?)\b/iy,
  // num_or_angle, pct, pct [ , num_or_pct]?
  // num_or_angle pct pct [ / num_or_pct]?
  hsl: expandRe(/^NA(\s*(,N%\s*){2}(,N%?\s*)?|(\s+N%){2}\s*(\/N%?\s*)?)$/),
  // num_or_angle|none pct|none pct|none [ / num_or_pct|none ]?
  hwb: expandRe(/^(NA|none)(\s+(N%|none)){2}\s*(\/(N%?|none)\s*)?$/),
  // num, num, num [ , num_or_pct]?
  // pct, pct, pct [ , num_or_pct]?
  // num num num [ / num_or_pct]?
  // pct pct pct [ / num_or_pct]?
  rgb: expandRe(/^N(%?)(\s*,N\1\s*,N\1\s*(,N%?\s*)?|\s+N\1\s+N\1\s*(\/N%?\s*)?)$/),
};
const ANGLE_TO_DEG = {
  __proto__: null,
  grad: 360 / 400,
  rad: 180 / Math.PI,
  turn: 360,
};
const TO_HSV = {
  __proto__: null,
  hex: RGBtoHSV,
  hsl: HSLtoHSV,
  hwb: HWBtoHSV,
  rgb: RGBtoHSV,
};
const FROM_HSV = {
  __proto__: null,
  hex: HSVtoRGB,
  hsl: HSVtoHSL,
  hwb: HSVtoHWB,
  rgb: HSVtoRGB,
};
export const guessType = c =>
  'r' in c ? 'rgb' :
    'w' in c ? 'hwb' :
      'v' in c ? 'hsv' :
        'l' in c ? 'hsl' :
          undefined;
export const fromHSV = (color, type) => FROM_HSV[type](color);
export const toHSV = color => TO_HSV[color.type || 'rgb'](color);

export function format(color = '', type = color.type, {[kHexUppercase]: upper, uso, round} = {}) {
  if (!color || !type)
    return typeof color === 'string' ? color : '';
  const {a, type: src = guessType(color)} = color;
  const hasA = !uso && a >= 0 && a < 1;
  const srcConv = src === 'hex' ? 'rgb' : src;
  const dstConv = type === 'hex' ? 'rgb' : type;
  const {r, g, b} = srcConv === dstConv ? color
    : color = FROM_HSV[dstConv](TO_HSV[srcConv](color));
  let aa;
  if (type === 'hex') {
    aa = hasA ? mathRound(a * 255) : 0;
    type = uso || r % 0x11 || g % 0x11 || b % 0x11 || aa % 0x11;
    color = type ? 0x100000000 + r * 0x1000000/* << goes negative*/ + (g << 16) + (b << 8) + aa
      : 0x10000 + (r / 0x11 << 12) + (g / 0x11 << 8) + (b / 0x11 << 4) + aa / 0x11;
    color = '#' + color.toString(16).slice(1, hasA ? undefined : type ? -2 : -1);
    if (upper && (
      r & 15 > 9 || r >= 160 ||
      g & 15 > 9 || g >= 160 ||
      b & 15 > 9 || b >= 160 ||
      hasA && (aa & 15 > 9 || aa >= 160)
    )) color = color.toUpperCase();
    return color;
  }
  aa = hasA && formatAlpha(a) || '';
  if (type === 'rgb') {
    return uso ? `${r}, ${g}, ${b}` : `rgb(${r}, ${g}, ${b}${aa ? ', ' : ''}${aa})`;
  }
  if (type === 'hwb') {
    const {h, w} = color;
    return 'hwb(' +
      (round ? `${mathRound(h)} ${mathRound(w)}% ${mathRound(b)}%` : `${h} ${w}% ${b}%`) +
      (aa ? ` / ${aa})` : ')');
  }
  if (type === 'hsl') {
    const {h, s, l} = color;
    return 'hsl(' +
      (round ? `${mathRound(h)} ${mathRound(s)}% ${mathRound(l)}%` : `${h} ${s}% ${l}%`) +
      (aa ? `, ${aa})` : ')');
  }
  return '';
}

export function parse(s) {
  if (typeof s !== 'string' || !(s = s.trim().toLowerCase())) {
    return;
  }
  if (s.charCodeAt(0) === 35/* # */) {
    return parseHex(s, s.length);
  }
  let i, v;
  if (s.charCodeAt(s.length - 1) !== 41/*)*/) {
    v = NAMED_COLORS.get(s);
    if (+v) NAMED_COLORS.set(s, v = {
      type: 'hex',
      r: v >> 16,
      g: (v >> 8) & 255,
      b: v & 255,
      a: undefined,
    });
    return v;
  }
  i = s.charCodeAt(3);
  if ((i = i === 40/*(*/ ? 4 : i === 97/*a*/ && s.charCodeAt(4) === 40/*(*/ && 5)
  && RX_COLOR[v = s.slice(0, 3)]
  && (s = s.slice(i, -1).trim())) {
    return parseFunc(v, s);
  }
}

function parseHex(str/*lowercase*/, len) {
  if (len === 4 || len === 5 || len === 7 || len === 9) {
    for (let i = 1, rgb = 0, alpha, c; ;) {
      c = str.charCodeAt(i);
      if ((c -= 48) >= 0 && c <= 9 || (c -= 39) >= 10 && c <= 15) {
        if (i === 7) alpha = c;
        else if (i === 8) alpha = (alpha << 4 | c) / 255;
        else if (i === 4 && len < 7) alpha = c * 0x11 / 255;
        else rgb = rgb << 4 | c;
        if (++i === len) {
          return {
            type: 'hex',
            r: len < 7 ? (rgb >> 8) * 0x11 : rgb >> 16,
            g: len < 7 ? (rgb >> 4 & 15) * 0x11 : rgb >> 8 & 255,
            b: len < 7 ? (rgb & 15) * 0x11 : rgb & 255,
            a: alpha,
          };
        }
      } else break;
    }
  }
}

function parseFunc(type, val) {
  let rgb, hwb;
  if (!(rgb = type === 'rgb') && !(hwb = type === 'hwb') && !(type === 'hsl'))
    return;
  let sA, n1, n2, n3, a, pct, units;
  n1 = val.indexOf('/');
  if (n1 > 0) {
    sA = val.slice(n1 + 1);
    val = val.slice(0, n1).trim();
  }
  const parts = val.split(n1 < 0 && val.includes(',') ? /\s*,\s*/ : /\s+/);
  const len = parts.length;
  const [s1, s2, s3] = parts;
  if (
    !(n1 > 0 ? len === 3 : len === 3 || len === 4 && (sA = parts[3])) ||
    isNaN(n1 = hwb && s1 === 'none' ? 0 :
      rgb ? ((pct = s1.charCodeAt(s1.length - 1) === 37/*%*/)) ? +s1.slice(0, -1) : +s1
        : ((units = RX_ANGLE.exec(s1)[0])) ? +s1.slice(0, -units.length) : +s1) ||
    isNaN(n2 = hwb && s2 === 'none' ? 0 :
      (n2 = s2.charCodeAt(s2.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        n2 ? +s2.slice(0, -1) : +s2) ||
    isNaN(n3 = hwb && s3 === 'none' ? 0 :
      (n3 = s3.charCodeAt(s3.length - 1) === 37) !== (rgb ? pct : true) ? NaN :
        n3 ? +s3.slice(0, -1) : +s3) ||
    sA != null && !(hwb && sA === 'none') &&
    isNaN(a = (sA = sA.trim()).charCodeAt(sA.length - 1) === 37 ? +sA.slice(0, -1) / 100 : +sA)
  ) return;
  if (a < 0) a = 0; else if (a > 1) a = 1;
  if (rgb) {
    return {
      type,
      r: (n1 = mathRound(pct ? n1 * 2.55 : n1)) < 0 ? 0 : n1 > 255 ? 255 : n1,
      g: (n2 = mathRound(pct ? n2 * 2.55 : n2)) < 0 ? 0 : n2 > 255 ? 255 : n2,
      b: (n3 = mathRound(pct ? n3 * 2.55 : n3)) < 0 ? 0 : n3 > 255 ? 255 : n3,
      a,
    };
  }
  if (units) n1 *= ANGLE_TO_DEG[units];
  if (n2 < 0) n2 = 0; else if (n2 > 100) n2 = 100;
  if (n3 < 0) n3 = 0; else if (n3 > 100) n3 = 100;
  return hwb
    ? {type, h: n1, w: n2, b: n3, a}
    : {type, h: n1, s: n2, l: n3, a};
}

export const formatAlpha = (a, precision = ALPHA_DIGITS) =>
  a <= 0 ? '0' : // clamping per CSS spec
    a >= 1 ? '1' : // clamping per CSS spec
      a > 0 && a < 1 // excluding NaN and undefined
        ? +(precision = a.toFixed(precision)) && precision < 1 ? precision.slice(1)
        : '' + a // the original value that exceeds precision e.g. 0.0001, 0.9995
      : '';

function RGBtoHSV({r, g, b, a}) {
  r /= 255;
  g /= 255;
  b /= 255;
  const MaxC = Math.max(r, g, b);
  const MinC = Math.min(r, g, b);
  const DeltaC = MaxC - MinC;

  let h =
    DeltaC === 0 ? 0 :
    MaxC === r ? 60 * (((g - b) / DeltaC) % 6) :
    MaxC === g ? 60 * (((b - r) / DeltaC) + 2) :
    MaxC === b ? 60 * (((r - g) / DeltaC) + 4) :
    0;
  h = constrainHue(h);
  return {
    type: 'hsv',
    h,
    s: MaxC === 0 ? 0 : DeltaC / MaxC,
    v: MaxC,
    a,
  };
}

function HSVtoRGB({h, s, v, a}) {
  h = constrainHue(h);
  const C = s * v;
  const X = C * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - C;
  const [r, g, b] =
    h >= 0 && h < 60 ? [C, X, 0] :
    h >= 60 && h < 120 ? [X, C, 0] :
    h >= 120 && h < 180 ? [0, C, X] :
    h >= 180 && h < 240 ? [0, X, C] :
    h >= 240 && h < 300 ? [X, 0, C] :
    h >= 300 && h < 360 ? [C, 0, X] : [];
  return {
    type: 'rgb',
    r: snapToInt(mathRound((r + m) * 255)),
    g: snapToInt(mathRound((g + m) * 255)),
    b: snapToInt(mathRound((b + m) * 255)),
    a,
  };
}


function HSLtoHSV({h, s, l, a}) {
  const t = s * (l < 50 ? l : 100 - l) / 100;
  return {
    type: 'hsv',
    h: constrainHue(h),
    s: t + l ? 200 * t / (t + l) / 100 : 0,
    v: (t + l) / 100,
    a,
  };
}

function HSVtoHSL({h, s, v, a}) {
  const l = (2 - s) * v / 2;
  const t = l < .5 ? l * 2 : 2 - l * 2;
  return {
    type: 'hsl',
    h: constrainHue(h),
    s: t ? s * v / t * 100 : 0,
    l: l * 100,
    a,
  };
}

function HWBtoHSV({h, w, b, a}) {
  w = (w < 0 ? 0 : w > 100 ? 100 : w) / 100;
  b = (b < 0 ? 0 : b > 100 ? 100 : b) / 100;
  return {
    type: 'hsv',
    h: constrainHue(h),
    s: b === 1 ? 0 : 1 - w / (1 - b),
    v: 1 - b,
    a,
  };
}

function HSVtoHWB({h, s, v, a}) {
  return {
    type: 'hwb',
    h: constrainHue(h),
    w: (1 - s) * v * 100,
    b: (1 - v) * 100,
    a,
  };
}

export function constrain(min, max, value) {
  return value < min ? min : value > max ? max : value;
}

export function constrainHue(h) {
  return h < 0 ? h % 360 + 360 :
    h >= 360 ? h % 360 :
      h;
}

export function snapToInt(num) {
  const int = mathRound(num);
  return Math.abs(int - num) < 1e-3 ? int : num;
}

export function testAt(rx, index, text) {
  if (!rx) return false;
  rx.lastIndex = index;
  return rx.test(text);
}

export const NAMED_COLORS = /*@__PURE__*/new Map([
  ['transparent', {r: 0, g: 0, b: 0, a: 0, type: 'rgb'}],
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
