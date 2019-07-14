'use strict';

const colorConverter = (() => {

  return {
    parse,
    format,
    formatAlpha,
    RGBtoHSV,
    HSVtoRGB,
    HSLtoHSV,
    HSVtoHSL,
    constrainHue,
    snapToInt,
    ALPHA_DIGITS: 3,
    // NAMED_COLORS is added below
  };

  function format(color = '', type = color.type, hexUppercase) {
    if (!color || !type) return typeof color === 'string' ? color : '';
    const a = formatAlpha(color.a);
    const hasA = Boolean(a);
    if (type === 'rgb' && color.type === 'hsl') {
      color = HSVtoRGB(HSLtoHSV(color));
    }
    const {r, g, b, h, s, l} = color;
    switch (type) {
      case 'hex': {
        const rgbStr = (0x1000000 + (r << 16) + (g << 8) + (b | 0)).toString(16).slice(1);
        const aStr = hasA ? (0x100 + Math.round(a * 255)).toString(16).slice(1) : '';
        const hexStr = `#${rgbStr + aStr}`.replace(/^#(.)\1(.)\2(.)\3(?:(.)\4)?$/, '#$1$2$3$4');
        return hexUppercase ? hexStr.toUpperCase() : hexStr.toLowerCase();
      }
      case 'rgb':
        return hasA ?
          `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})` :
          `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      case 'hsl':
        return hasA ?
          `hsla(${h}, ${s}%, ${l}%, ${a})` :
          `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  // Copied from _hexcolor() in parserlib.js
  function validateHex(color) {
    return /^#[a-f\d]+$/i.test(color) && [4, 5, 7, 9].some(n => color.length === n);
  }

  function validateRGB(nums) {
    const isPercentage = nums[0].endsWith('%');
    const valid = isPercentage ? validatePercentage : validateNum;
    return nums.slice(0, 3).every(valid);
  }

  function validatePercentage(s) {
    if (!s.endsWith('%')) return false;
    const n = Number(s.slice(0, -1));
    return n >= 0 && n <= 100;
  }

  function validateNum(s) {
    const n = Number(s);
    return n >= 0 && n <= 255;
  }

  function validateHSL(nums) {
    return validateAngle(nums[0]) && nums.slice(1, 3).every(validatePercentage);
  }

  function validateAngle(s) {
    return /^-?(\d+|\d*\.\d+)(deg|grad|rad|turn)?$/i.test(s);
  }

  function validateAlpha(alpha) {
    if (alpha.endsWith('%')) {
      return validatePercentage(alpha);
    }
    const n = Number(alpha);
    return n >= 0 && n <= 1;
  }

  function parse(str) {
    if (typeof str !== 'string') return;
    str = str.trim();
    if (!str) return;

    if (str[0] !== '#' && !str.includes('(')) {
      // eslint-disable-next-line no-use-before-define
      str = colorConverter.NAMED_COLORS.get(str);
      if (!str) return;
    }

    if (str[0] === '#') {
      if (!validateHex(str)) {
        return null;
      }
      str = str.slice(1);
      const [r, g, b, a = 255] = str.length <= 4 ?
        str.match(/(.)/g).map(c => parseInt(c + c, 16)) :
        str.match(/(..)/g).map(c => parseInt(c, 16));
      return {type: 'hex', r, g, b, a: a === 255 ? undefined : a / 255};
    }

    const [, type, value] = str.match(/^(rgb|hsl)a?\((.*?)\)|$/i);
    if (!type) return;

    const comma = value.includes(',') && !value.includes('/');
    const num = value.split(comma ? /\s*,\s*/ : /\s+(?!\/)|\s*\/\s*/);
    if (num.length < 3 || num.length > 4) return;
    if (num[3] && !validateAlpha(num[3])) return null;

    let a = !num[3] ? 1 : parseFloat(num[3]) / (num[3].endsWith('%') ? 100 : 1);
    if (isNaN(a)) a = 1;

    const first = num[0];
    if (/rgb/i.test(type)) {
      if (!validateRGB(num)) {
        return null;
      }
      const k = first.endsWith('%') ? 2.55 : 1;
      const [r, g, b] = num.map(s => Math.round(parseFloat(s) * k));
      return {type: 'rgb', r, g, b, a};
    } else {
      if (!validateHSL(num)) {
        return null;
      }
      let h = parseFloat(first);
      if (first.endsWith('grad')) h *= 360 / 400;
      else if (first.endsWith('rad')) h *= 180 / Math.PI;
      else if (first.endsWith('turn')) h *= 360;
      const s = parseFloat(num[1]);
      const l = parseFloat(num[2]);
      return {type: 'hsl', h, s, l, a};
    }
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

  function HSVtoRGB({h, s, v}) {
    h = constrainHue(h) % 360;
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

  function HSVtoHSL({h, s, v}) {
    const l = (2 - s) * v / 2;
    const t = l < .5 ? l * 2 : 2 - l * 2;
    return {
      h: Math.round(constrainHue(h)),
      s: Math.round(t ? s * v / t * 100 : 0),
      l: Math.round(l * 100),
    };
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
