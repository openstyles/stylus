'use strict';

const colorConverter = (() => {

  const RXS_NUM = /\s*([+-]?(?:\d+\.?\d*|\d*\.\d+))(?:e[+-]?\d+)?/.source;
  const RXS_NUM_ANGLE = `${RXS_NUM}(deg|g?rad|turn)?`;
  const RX_COLOR = {
    hex: /#([a-f\d]{3}(?:[a-f\d](?:[a-f\d]{2}){0,2})?)\b/iy,

    hsl: new RegExp([
      // num_or_angle, pct, pct [ , num_or_pct]?
      `^(${RXS_NUM_ANGLE})\\s*,(${RXS_NUM}%\\s*(,|$)){2}(${RXS_NUM}%?)?\\s*$`,
      // num_or_angle pct pct [ / num_or_pct]?
      `^(${RXS_NUM_ANGLE})\\s+(${RXS_NUM}%\\s*(\\s|$)){2}(/${RXS_NUM}%?)?\\s*$`,
    ].join('|'), 'iy'),

    hwb: new RegExp(
      // num|angle|none pct|none pct|none [ / num|pct|none ]?
      `^(${RXS_NUM_ANGLE}|none)(\\s+(${RXS_NUM}%|none)){2}(\\s+|$)(/${RXS_NUM}%?|none)?\\s*$`,
      'iy'),

    rgb: new RegExp([
      // num, num, num [ , num_or_pct]?
      // pct, pct, pct [ , num_or_pct]?
      `^((${RXS_NUM}\\s*(,|$)){3}|(${RXS_NUM}%\\s*(,|$)){3})(${RXS_NUM}%?)?\\s*$`,
      // num num num [ / num_or_pct]?
      // pct pct pct [ / num_or_pct]?
      `^((${RXS_NUM}\\s*(\\s|$)){3}|(${RXS_NUM}%\\s*(\\s|$)){3})(/${RXS_NUM}%?)?\\s*$`,
    ].join('|'), 'iy'),
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
  const guessType = c =>
    'r' in c ? 'rgb' :
      'w' in c ? 'hwb' :
        'v' in c ? 'hsv' :
          'l' in c ? 'hsl' :
            undefined;

  return {
    parse,
    format,
    formatAlpha,
    fromHSV: (color, type) => FROM_HSV[type](color),
    toHSV: color => TO_HSV[color.type || 'rgb'](color),
    constrain,
    constrainHue,
    guessType,
    snapToInt,
    testAt,
    ALPHA_DIGITS: 3,
    RX_COLOR,
    // NAMED_COLORS is added below
  };

  function format(color = '', type = color.type, {hexUppercase, usoMode, round} = {}) {
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

  function parse(str) {
    if (typeof str !== 'string') return;
    str = str.trim().toLowerCase();
    if (!str) return;

    if (str[0] !== '#' && !str.includes('(')) {
      // eslint-disable-next-line no-use-before-define
      str = colorConverter.NAMED_COLORS.get(str);
      if (!str) return;
    }

    if (str[0] === '#') {
      if (!testAt(RX_COLOR.hex, 0, str)) {
        return;
      }
      str = str.slice(1);
      const [r, g, b, a = 255] = str.length <= 4 ?
        str.match(/(.)/g).map(c => parseInt(c + c, 16)) :
        str.match(/(..)/g).map(c => parseInt(c, 16));
      return {
        type: 'hex',
        r,
        g,
        b,
        a: a === 255 ? undefined : a / 255,
      };
    }

    const [, func, type = func, value] = str.match(/^((rgb|hsl)a?|hwb)\(\s*(.*?)\s*\)|$/);
    if (!func || !testAt(RX_COLOR[type], 0, value)) {
      return;
    }
    const strings = value.split(/\s*[,/]\s*|\s+/);
    const [s1, /*s2*/, /*s3*/, sA] = strings;
    const [n1, n2, n3, nA] = strings.map(parseFloat);
    const a = isNaN(nA) ? 1 : constrain(0, 1, nA / (sA.endsWith('%') ? 100 : 1));

    if (type === 'rgb') {
      const k = s1.endsWith('%') ? 2.55 : 1;
      return {
        type,
        r: constrain(0, 255, Math.round(n1 * k)),
        g: constrain(0, 255, Math.round(n2 * k)),
        b: constrain(0, 255, Math.round(n3 * k)),
        a,
      };
    }

    const h = constrainHue(n1 * (ANGLE_TO_DEG[s1.match(/\D*$/)[0]] || 1));
    const n2c = constrain(0, 100, n2 || 0);
    const n3c = constrain(0, 100, n3 || 0);
    return type === 'hwb'
      ? {type, h, w: n2c, b: n3c, a}
      : {type, h, s: n2c, l: n3c, a};
  }

  function formatAlpha(a) {
    return isNaN(a) ? '' :
      (a + .5 * Math.pow(10, -colorConverter.ALPHA_DIGITS))
        .toFixed(colorConverter.ALPHA_DIGITS + 1)
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

  function constrain(min, max, value) {
    return value < min ? min : value > max ? max : value;
  }

  function constrainHue(h) {
    return h < 0 ? h % 360 + 360 :
      h > 360 ? h % 360 :
        h;
  }

  function snapToInt(num) {
    const int = Math.round(num);
    return Math.abs(int - num) < 1e-3 ? int : num;
  }

  function hex2(val) {
    return (val < 16 ? '0' : '') + Math.round(val).toString(16);
  }

  function testAt(rx, index, text) {
    if (!rx) return false;
    rx.lastIndex = index;
    return rx.test(text);
  }
})();

colorConverter.NAMED_COLORS = new Map([
  ['transparent', 'rgba(0, 0, 0, 0)'],
  // CSS4 named colors
  ['aliceblue', '#f0f8ff'],
  ['antiquewhite', '#faebd7'],
  ['aqua', '#00ffff'],
  ['aquamarine', '#7fffd4'],
  ['azure', '#f0ffff'],
  ['beige', '#f5f5dc'],
  ['bisque', '#ffe4c4'],
  ['black', '#000000'],
  ['blanchedalmond', '#ffebcd'],
  ['blue', '#0000ff'],
  ['blueviolet', '#8a2be2'],
  ['brown', '#a52a2a'],
  ['burlywood', '#deb887'],
  ['cadetblue', '#5f9ea0'],
  ['chartreuse', '#7fff00'],
  ['chocolate', '#d2691e'],
  ['coral', '#ff7f50'],
  ['cornflowerblue', '#6495ed'],
  ['cornsilk', '#fff8dc'],
  ['crimson', '#dc143c'],
  ['cyan', '#00ffff'],
  ['darkblue', '#00008b'],
  ['darkcyan', '#008b8b'],
  ['darkgoldenrod', '#b8860b'],
  ['darkgray', '#a9a9a9'],
  ['darkgrey', '#a9a9a9'],
  ['darkgreen', '#006400'],
  ['darkkhaki', '#bdb76b'],
  ['darkmagenta', '#8b008b'],
  ['darkolivegreen', '#556b2f'],
  ['darkorange', '#ff8c00'],
  ['darkorchid', '#9932cc'],
  ['darkred', '#8b0000'],
  ['darksalmon', '#e9967a'],
  ['darkseagreen', '#8fbc8f'],
  ['darkslateblue', '#483d8b'],
  ['darkslategray', '#2f4f4f'],
  ['darkslategrey', '#2f4f4f'],
  ['darkturquoise', '#00ced1'],
  ['darkviolet', '#9400d3'],
  ['deeppink', '#ff1493'],
  ['deepskyblue', '#00bfff'],
  ['dimgray', '#696969'],
  ['dimgrey', '#696969'],
  ['dodgerblue', '#1e90ff'],
  ['firebrick', '#b22222'],
  ['floralwhite', '#fffaf0'],
  ['forestgreen', '#228b22'],
  ['fuchsia', '#ff00ff'],
  ['gainsboro', '#dcdcdc'],
  ['ghostwhite', '#f8f8ff'],
  ['gold', '#ffd700'],
  ['goldenrod', '#daa520'],
  ['gray', '#808080'],
  ['grey', '#808080'],
  ['green', '#008000'],
  ['greenyellow', '#adff2f'],
  ['honeydew', '#f0fff0'],
  ['hotpink', '#ff69b4'],
  ['indianred', '#cd5c5c'],
  ['indigo', '#4b0082'],
  ['ivory', '#fffff0'],
  ['khaki', '#f0e68c'],
  ['lavender', '#e6e6fa'],
  ['lavenderblush', '#fff0f5'],
  ['lawngreen', '#7cfc00'],
  ['lemonchiffon', '#fffacd'],
  ['lightblue', '#add8e6'],
  ['lightcoral', '#f08080'],
  ['lightcyan', '#e0ffff'],
  ['lightgoldenrodyellow', '#fafad2'],
  ['lightgray', '#d3d3d3'],
  ['lightgrey', '#d3d3d3'],
  ['lightgreen', '#90ee90'],
  ['lightpink', '#ffb6c1'],
  ['lightsalmon', '#ffa07a'],
  ['lightseagreen', '#20b2aa'],
  ['lightskyblue', '#87cefa'],
  ['lightslategray', '#778899'],
  ['lightslategrey', '#778899'],
  ['lightsteelblue', '#b0c4de'],
  ['lightyellow', '#ffffe0'],
  ['lime', '#00ff00'],
  ['limegreen', '#32cd32'],
  ['linen', '#faf0e6'],
  ['magenta', '#ff00ff'],
  ['maroon', '#800000'],
  ['mediumaquamarine', '#66cdaa'],
  ['mediumblue', '#0000cd'],
  ['mediumorchid', '#ba55d3'],
  ['mediumpurple', '#9370db'],
  ['mediumseagreen', '#3cb371'],
  ['mediumslateblue', '#7b68ee'],
  ['mediumspringgreen', '#00fa9a'],
  ['mediumturquoise', '#48d1cc'],
  ['mediumvioletred', '#c71585'],
  ['midnightblue', '#191970'],
  ['mintcream', '#f5fffa'],
  ['mistyrose', '#ffe4e1'],
  ['moccasin', '#ffe4b5'],
  ['navajowhite', '#ffdead'],
  ['navy', '#000080'],
  ['oldlace', '#fdf5e6'],
  ['olive', '#808000'],
  ['olivedrab', '#6b8e23'],
  ['orange', '#ffa500'],
  ['orangered', '#ff4500'],
  ['orchid', '#da70d6'],
  ['palegoldenrod', '#eee8aa'],
  ['palegreen', '#98fb98'],
  ['paleturquoise', '#afeeee'],
  ['palevioletred', '#db7093'],
  ['papayawhip', '#ffefd5'],
  ['peachpuff', '#ffdab9'],
  ['peru', '#cd853f'],
  ['pink', '#ffc0cb'],
  ['plum', '#dda0dd'],
  ['powderblue', '#b0e0e6'],
  ['purple', '#800080'],
  ['rebeccapurple', '#663399'],
  ['red', '#ff0000'],
  ['rosybrown', '#bc8f8f'],
  ['royalblue', '#4169e1'],
  ['saddlebrown', '#8b4513'],
  ['salmon', '#fa8072'],
  ['sandybrown', '#f4a460'],
  ['seagreen', '#2e8b57'],
  ['seashell', '#fff5ee'],
  ['sienna', '#a0522d'],
  ['silver', '#c0c0c0'],
  ['skyblue', '#87ceeb'],
  ['slateblue', '#6a5acd'],
  ['slategray', '#708090'],
  ['slategrey', '#708090'],
  ['snow', '#fffafa'],
  ['springgreen', '#00ff7f'],
  ['steelblue', '#4682b4'],
  ['tan', '#d2b48c'],
  ['teal', '#008080'],
  ['thistle', '#d8bfd8'],
  ['tomato', '#ff6347'],
  ['turquoise', '#40e0d0'],
  ['violet', '#ee82ee'],
  ['wheat', '#f5deb3'],
  ['white', '#ffffff'],
  ['whitesmoke', '#f5f5f5'],
  ['yellow', '#ffff00'],
  ['yellowgreen', '#9acd32'],
]);
