let HEX;

export const ALPHA_DIGITS = 3;
// All groups in RXS_NUM must use ?: in order to enable \1 in RX_COLOR.rgb
const RXS_NUM = /\s*[+-]?(\.\d+|\d+(\.\d*)?)(e[+-]?\d+)?/.source.replace(/\(/g, '(?:');
const RXS_ANGLE = '(?:deg|g?rad|turn)?';
const expandRe = re => RegExp(re.source.replace(/N/g, RXS_NUM).replace(/A/g, RXS_ANGLE), 'iy');
export const RX_COLOR = {
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
  grad: 360 / 400,
  rad: 180 / Math.PI,
  turn: 360,
};
const TO_HSV = {
  hex: RGBtoHSV,
  hsl: HSLtoHSV,
  hwb: HWBtoHSV,
  rgb: RGBtoHSV,
};
const FROM_HSV = {
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

export function format(color = '', type = color.type, {hexUppercase, usoMode, round} = {}) {
  if (!color || !type) return typeof color === 'string' ? color : '';
  const {a, type: src = guessType(color)} = color;
  const aFmt = formatAlpha(a);
  const aStr = aFmt ? ', ' + aFmt : '';
  const srcConv = src === 'hex' ? 'rgb' : src;
  const dstConv = type === 'hex' ? 'rgb' : type;
  color = srcConv === dstConv ? color : FROM_HSV[dstConv](TO_HSV[srcConv](color));
  round = round ? Math.round : v => v;
  const {r, g, b, h, s, l, w} = color;
  switch (type) {
    case 'hex': {
      let res = '#' + hex2(r) + hex2(g) + hex2(b) + (aStr ? hex2(Math.round(a * 255)) : '');
      if (!usoMode) res = res.replace(/^#(.)\1(.)\2(.)\3(?:(.)\4)?$/, '#$1$2$3$4');
      return hexUppercase ? res.toUpperCase() : res;
    }
    case 'rgb': {
      const rgb = [r, g, b].map(Math.round).join(', ');
      return usoMode ? rgb : `rgb${aStr ? 'a' : ''}(${rgb}${aStr})`;
    }
    case 'hsl':
      return `hsl${aStr ? 'a' : ''}(${round(h)}, ${round(s)}%, ${round(l)}%${aStr})`;
    case 'hwb':
      return `hwb(${round(h)} ${round(w)}% ${round(b)}%${aFmt ? ' / ' + aFmt : ''})`;
  }
}

export function parse(s) {
  if (typeof s !== 'string' || !(s = s.trim())) {
    return;
  } else if (s[0] === '#') {
    return parseHex(s);
  } else if (s.endsWith(')') && (s = s.match(/^(hwb|(hsl|rgb)a?)\(\s*([^)]+)/i))) {
    return parseFunc((s[2] || s[1]).toLowerCase(), s[3]);
  } else {
    return NAMED_COLORS.get(s.toLowerCase()); // eslint-disable-line no-use-before-define
  }
}

function initHexMap() {
  HEX = Array(256).fill(-0xFFFF); // ensuring a PACKED_SMI array
  for (let i = 48; i < 58; i++) HEX[i] = i - 48; // 0123456789
  for (let i = 65; i < 71; i++) HEX[i] = i - 65 + 10; // ABCDEF
  for (let i = 97; i < 103; i++) HEX[i] = i - 97 + 10; // abcdef
}

function parseHex(str) {
  if (!HEX) initHexMap();
  let r, g, b, a;
  const len = str.length;
  if (len === 4 || len === 5
    ? (r = HEX[str.charCodeAt(1)] * 0x11) >= 0 &&
      (g = HEX[str.charCodeAt(2)] * 0x11) >= 0 &&
      (b = HEX[str.charCodeAt(3)] * 0x11) >= 0 &&
      (len < 5 || (a = HEX[str.charCodeAt(4)] * 0x11 / 255) >= 0)
    : (len === 7 || len === 9) &&
      (r = HEX[str.charCodeAt(1)] * 0x10 + HEX[str.charCodeAt(2)]) >= 0 &&
      (g = HEX[str.charCodeAt(3)] * 0x10 + HEX[str.charCodeAt(4)]) >= 0 &&
      (b = HEX[str.charCodeAt(5)] * 0x10 + HEX[str.charCodeAt(6)]) >= 0 &&
      (len < 9 || (a = (HEX[str.charCodeAt(7)] * 0x10 + HEX[str.charCodeAt(8)]) / 255) >= 0)
  ) {
    return {type: 'hex', r, g, b, a};
  }
}

function parseFunc(type, val) {
  if (!testAt(RX_COLOR[type], 0, val)) {
    return;
  }
  // Not using destructuring because it's slow
  const parts = val.trim().split(/\s*[,/]\s*|\s+/);
  const n1 = parseFloat(parts[0]);
  const n2 = parseFloat(parts[1]);
  const n3 = parseFloat(parts[2]);
  const nA = parseFloat(parts[3]);
  const a = isNaN(nA) ? undefined : constrain(0, 1, parts[3].endsWith('%') ? nA / 100 : nA);
  if (type === 'rgb') {
    const k = parts[0].endsWith('%') ? 2.55 : 1;
    return {
      type,
      r: constrain(0, 255, Math.round(n1 * k)),
      g: constrain(0, 255, Math.round(n2 * k)),
      b: constrain(0, 255, Math.round(n3 * k)),
      a,
    };
  }
  const h = constrainHue(n1 * (ANGLE_TO_DEG[parts[0].match(/\D*$/)[0].toLowerCase()] || 1));
  const n2c = constrain(0, 100, n2 || 0);
  const n3c = constrain(0, 100, n3 || 0);
  return type === 'hwb'
    ? {type, h, w: n2c, b: n3c, a}
    : {type, h, s: n2c, l: n3c, a};
}

export function formatAlpha(a) {
  return isNaN(a) ? '' :
    (a + .5 * Math.pow(10, -ALPHA_DIGITS))
      .toFixed(ALPHA_DIGITS + 1)
      .slice(0, -1)
      .replace(/^0(?=\.[1-9])|^1\.0+?$|\.?0+$/g, '');
}

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
    r: snapToInt(Math.round((r + m) * 255)),
    g: snapToInt(Math.round((g + m) * 255)),
    b: snapToInt(Math.round((b + m) * 255)),
    a,
  };
}


function HSLtoHSV({h, s, l, a}) {
  const t = s * (l < 50 ? l : 100 - l) / 100;
  return {
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
    h: constrainHue(h),
    s: t ? s * v / t * 100 : 0,
    l: l * 100,
    a,
  };
}

function HWBtoHSV({h, w, b, a}) {
  w = constrain(0, 100, w) / 100;
  b = constrain(0, 100, b) / 100;
  return {
    h: constrainHue(h),
    s: b === 1 ? 0 : 1 - w / (1 - b),
    v: 1 - b,
    a,
  };
}

function HSVtoHWB({h, s, v, a}) {
  return {
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
  const int = Math.round(num);
  return Math.abs(int - num) < 1e-3 ? int : num;
}

function hex2(val) {
  return (val < 16 ? '0' : '') + Math.round(val).toString(16);
}

export function testAt(rx, index, text) {
  if (!rx) return false;
  rx.lastIndex = index;
  return rx.test(text);
}

export const NAMED_COLORS = new Map([
  ['transparent', {r: 0, g: 0, b: 0, a: 0, type: 'rgb'}],
  ['aliceblue', {r: 240, g: 248, b: 255, type: 'hex'}],
  ['antiquewhite', {r: 250, g: 235, b: 215, type: 'hex'}],
  ['aqua', {r: 0, g: 255, b: 255, type: 'hex'}],
  ['aquamarine', {r: 127, g: 255, b: 212, type: 'hex'}],
  ['azure', {r: 240, g: 255, b: 255, type: 'hex'}],
  ['beige', {r: 245, g: 245, b: 220, type: 'hex'}],
  ['bisque', {r: 255, g: 228, b: 196, type: 'hex'}],
  ['black', {r: 0, g: 0, b: 0, type: 'hex'}],
  ['blanchedalmond', {r: 255, g: 235, b: 205, type: 'hex'}],
  ['blue', {r: 0, g: 0, b: 255, type: 'hex'}],
  ['blueviolet', {r: 138, g: 43, b: 226, type: 'hex'}],
  ['brown', {r: 165, g: 42, b: 42, type: 'hex'}],
  ['burlywood', {r: 222, g: 184, b: 135, type: 'hex'}],
  ['cadetblue', {r: 95, g: 158, b: 160, type: 'hex'}],
  ['chartreuse', {r: 127, g: 255, b: 0, type: 'hex'}],
  ['chocolate', {r: 210, g: 105, b: 30, type: 'hex'}],
  ['coral', {r: 255, g: 127, b: 80, type: 'hex'}],
  ['cornflowerblue', {r: 100, g: 149, b: 237, type: 'hex'}],
  ['cornsilk', {r: 255, g: 248, b: 220, type: 'hex'}],
  ['crimson', {r: 220, g: 20, b: 60, type: 'hex'}],
  ['cyan', {r: 0, g: 255, b: 255, type: 'hex'}],
  ['darkblue', {r: 0, g: 0, b: 139, type: 'hex'}],
  ['darkcyan', {r: 0, g: 139, b: 139, type: 'hex'}],
  ['darkgoldenrod', {r: 184, g: 134, b: 11, type: 'hex'}],
  ['darkgray', {r: 169, g: 169, b: 169, type: 'hex'}],
  ['darkgrey', {r: 169, g: 169, b: 169, type: 'hex'}],
  ['darkgreen', {r: 0, g: 100, b: 0, type: 'hex'}],
  ['darkkhaki', {r: 189, g: 183, b: 107, type: 'hex'}],
  ['darkmagenta', {r: 139, g: 0, b: 139, type: 'hex'}],
  ['darkolivegreen', {r: 85, g: 107, b: 47, type: 'hex'}],
  ['darkorange', {r: 255, g: 140, b: 0, type: 'hex'}],
  ['darkorchid', {r: 153, g: 50, b: 204, type: 'hex'}],
  ['darkred', {r: 139, g: 0, b: 0, type: 'hex'}],
  ['darksalmon', {r: 233, g: 150, b: 122, type: 'hex'}],
  ['darkseagreen', {r: 143, g: 188, b: 143, type: 'hex'}],
  ['darkslateblue', {r: 72, g: 61, b: 139, type: 'hex'}],
  ['darkslategray', {r: 47, g: 79, b: 79, type: 'hex'}],
  ['darkslategrey', {r: 47, g: 79, b: 79, type: 'hex'}],
  ['darkturquoise', {r: 0, g: 206, b: 209, type: 'hex'}],
  ['darkviolet', {r: 148, g: 0, b: 211, type: 'hex'}],
  ['deeppink', {r: 255, g: 20, b: 147, type: 'hex'}],
  ['deepskyblue', {r: 0, g: 191, b: 255, type: 'hex'}],
  ['dimgray', {r: 105, g: 105, b: 105, type: 'hex'}],
  ['dimgrey', {r: 105, g: 105, b: 105, type: 'hex'}],
  ['dodgerblue', {r: 30, g: 144, b: 255, type: 'hex'}],
  ['firebrick', {r: 178, g: 34, b: 34, type: 'hex'}],
  ['floralwhite', {r: 255, g: 250, b: 240, type: 'hex'}],
  ['forestgreen', {r: 34, g: 139, b: 34, type: 'hex'}],
  ['fuchsia', {r: 255, g: 0, b: 255, type: 'hex'}],
  ['gainsboro', {r: 220, g: 220, b: 220, type: 'hex'}],
  ['ghostwhite', {r: 248, g: 248, b: 255, type: 'hex'}],
  ['gold', {r: 255, g: 215, b: 0, type: 'hex'}],
  ['goldenrod', {r: 218, g: 165, b: 32, type: 'hex'}],
  ['gray', {r: 128, g: 128, b: 128, type: 'hex'}],
  ['grey', {r: 128, g: 128, b: 128, type: 'hex'}],
  ['green', {r: 0, g: 128, b: 0, type: 'hex'}],
  ['greenyellow', {r: 173, g: 255, b: 47, type: 'hex'}],
  ['honeydew', {r: 240, g: 255, b: 240, type: 'hex'}],
  ['hotpink', {r: 255, g: 105, b: 180, type: 'hex'}],
  ['indianred', {r: 205, g: 92, b: 92, type: 'hex'}],
  ['indigo', {r: 75, g: 0, b: 130, type: 'hex'}],
  ['ivory', {r: 255, g: 255, b: 240, type: 'hex'}],
  ['khaki', {r: 240, g: 230, b: 140, type: 'hex'}],
  ['lavender', {r: 230, g: 230, b: 250, type: 'hex'}],
  ['lavenderblush', {r: 255, g: 240, b: 245, type: 'hex'}],
  ['lawngreen', {r: 124, g: 252, b: 0, type: 'hex'}],
  ['lemonchiffon', {r: 255, g: 250, b: 205, type: 'hex'}],
  ['lightblue', {r: 173, g: 216, b: 230, type: 'hex'}],
  ['lightcoral', {r: 240, g: 128, b: 128, type: 'hex'}],
  ['lightcyan', {r: 224, g: 255, b: 255, type: 'hex'}],
  ['lightgoldenrodyellow', {r: 250, g: 250, b: 210, type: 'hex'}],
  ['lightgray', {r: 211, g: 211, b: 211, type: 'hex'}],
  ['lightgrey', {r: 211, g: 211, b: 211, type: 'hex'}],
  ['lightgreen', {r: 144, g: 238, b: 144, type: 'hex'}],
  ['lightpink', {r: 255, g: 182, b: 193, type: 'hex'}],
  ['lightsalmon', {r: 255, g: 160, b: 122, type: 'hex'}],
  ['lightseagreen', {r: 32, g: 178, b: 170, type: 'hex'}],
  ['lightskyblue', {r: 135, g: 206, b: 250, type: 'hex'}],
  ['lightslategray', {r: 119, g: 136, b: 153, type: 'hex'}],
  ['lightslategrey', {r: 119, g: 136, b: 153, type: 'hex'}],
  ['lightsteelblue', {r: 176, g: 196, b: 222, type: 'hex'}],
  ['lightyellow', {r: 255, g: 255, b: 224, type: 'hex'}],
  ['lime', {r: 0, g: 255, b: 0, type: 'hex'}],
  ['limegreen', {r: 50, g: 205, b: 50, type: 'hex'}],
  ['linen', {r: 250, g: 240, b: 230, type: 'hex'}],
  ['magenta', {r: 255, g: 0, b: 255, type: 'hex'}],
  ['maroon', {r: 128, g: 0, b: 0, type: 'hex'}],
  ['mediumaquamarine', {r: 102, g: 205, b: 170, type: 'hex'}],
  ['mediumblue', {r: 0, g: 0, b: 205, type: 'hex'}],
  ['mediumorchid', {r: 186, g: 85, b: 211, type: 'hex'}],
  ['mediumpurple', {r: 147, g: 112, b: 219, type: 'hex'}],
  ['mediumseagreen', {r: 60, g: 179, b: 113, type: 'hex'}],
  ['mediumslateblue', {r: 123, g: 104, b: 238, type: 'hex'}],
  ['mediumspringgreen', {r: 0, g: 250, b: 154, type: 'hex'}],
  ['mediumturquoise', {r: 72, g: 209, b: 204, type: 'hex'}],
  ['mediumvioletred', {r: 199, g: 21, b: 133, type: 'hex'}],
  ['midnightblue', {r: 25, g: 25, b: 112, type: 'hex'}],
  ['mintcream', {r: 245, g: 255, b: 250, type: 'hex'}],
  ['mistyrose', {r: 255, g: 228, b: 225, type: 'hex'}],
  ['moccasin', {r: 255, g: 228, b: 181, type: 'hex'}],
  ['navajowhite', {r: 255, g: 222, b: 173, type: 'hex'}],
  ['navy', {r: 0, g: 0, b: 128, type: 'hex'}],
  ['oldlace', {r: 253, g: 245, b: 230, type: 'hex'}],
  ['olive', {r: 128, g: 128, b: 0, type: 'hex'}],
  ['olivedrab', {r: 107, g: 142, b: 35, type: 'hex'}],
  ['orange', {r: 255, g: 165, b: 0, type: 'hex'}],
  ['orangered', {r: 255, g: 69, b: 0, type: 'hex'}],
  ['orchid', {r: 218, g: 112, b: 214, type: 'hex'}],
  ['palegoldenrod', {r: 238, g: 232, b: 170, type: 'hex'}],
  ['palegreen', {r: 152, g: 251, b: 152, type: 'hex'}],
  ['paleturquoise', {r: 175, g: 238, b: 238, type: 'hex'}],
  ['palevioletred', {r: 219, g: 112, b: 147, type: 'hex'}],
  ['papayawhip', {r: 255, g: 239, b: 213, type: 'hex'}],
  ['peachpuff', {r: 255, g: 218, b: 185, type: 'hex'}],
  ['peru', {r: 205, g: 133, b: 63, type: 'hex'}],
  ['pink', {r: 255, g: 192, b: 203, type: 'hex'}],
  ['plum', {r: 221, g: 160, b: 221, type: 'hex'}],
  ['powderblue', {r: 176, g: 224, b: 230, type: 'hex'}],
  ['purple', {r: 128, g: 0, b: 128, type: 'hex'}],
  ['rebeccapurple', {r: 102, g: 51, b: 153, type: 'hex'}],
  ['red', {r: 255, g: 0, b: 0, type: 'hex'}],
  ['rosybrown', {r: 188, g: 143, b: 143, type: 'hex'}],
  ['royalblue', {r: 65, g: 105, b: 225, type: 'hex'}],
  ['saddlebrown', {r: 139, g: 69, b: 19, type: 'hex'}],
  ['salmon', {r: 250, g: 128, b: 114, type: 'hex'}],
  ['sandybrown', {r: 244, g: 164, b: 96, type: 'hex'}],
  ['seagreen', {r: 46, g: 139, b: 87, type: 'hex'}],
  ['seashell', {r: 255, g: 245, b: 238, type: 'hex'}],
  ['sienna', {r: 160, g: 82, b: 45, type: 'hex'}],
  ['silver', {r: 192, g: 192, b: 192, type: 'hex'}],
  ['skyblue', {r: 135, g: 206, b: 235, type: 'hex'}],
  ['slateblue', {r: 106, g: 90, b: 205, type: 'hex'}],
  ['slategray', {r: 112, g: 128, b: 144, type: 'hex'}],
  ['slategrey', {r: 112, g: 128, b: 144, type: 'hex'}],
  ['snow', {r: 255, g: 250, b: 250, type: 'hex'}],
  ['springgreen', {r: 0, g: 255, b: 127, type: 'hex'}],
  ['steelblue', {r: 70, g: 130, b: 180, type: 'hex'}],
  ['tan', {r: 210, g: 180, b: 140, type: 'hex'}],
  ['teal', {r: 0, g: 128, b: 128, type: 'hex'}],
  ['thistle', {r: 216, g: 191, b: 216, type: 'hex'}],
  ['tomato', {r: 255, g: 99, b: 71, type: 'hex'}],
  ['turquoise', {r: 64, g: 224, b: 208, type: 'hex'}],
  ['violet', {r: 238, g: 130, b: 238, type: 'hex'}],
  ['wheat', {r: 245, g: 222, b: 179, type: 'hex'}],
  ['white', {r: 255, g: 255, b: 255, type: 'hex'}],
  ['whitesmoke', {r: 245, g: 245, b: 245, type: 'hex'}],
  ['yellow', {r: 255, g: 255, b: 0, type: 'hex'}],
  ['yellowgreen', {r: 154, g: 205, b: 50, type: 'hex'}],
]);
