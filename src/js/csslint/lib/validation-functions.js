const VTFunctions = {
  color: {
    __proto__: null,
    'color-mix': 'in [ srgb | srgb-linear | lab | oklab | xyz | xyz-d50 | xyz-d65 ' +
      '| [ hsl | hwb | lch | oklch ] [ [ shorter | longer | increasing | decreasing ] hue ]? ' +
      '] , [ <color> && <pct0-100>? ]#{2}',
    'color': 'from <color> [ ' +
        '<custom-prop> [ <num-pct-none> <custom-ident> ]# | ' +
        '<rgb-xyz> [ <num-pct-none> | r | g | b | x | y | z ]{3} ' +
      '] [ / <num-pct-none> | r | g | b | x | y | z ]? | ' +
      '[ <rgb-xyz> <num-pct-none>{3} | <custom-prop> <num-pct-none># ] <alpha>?',
    'hsl': '<hue> , <pct>#{2} [ , <num-pct0+> ]? | ' +
      '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
      'from <color> [ <hue> | <rel-hsl> ] <rel-hsl-num-pct>{2} [ / <rel-hsl-num-pct> ]?',
    'hwb': '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
      'from <color> [ <hue> | <rel-hwb> ] <rel-hwb-num-pct>{2} [ / <rel-hwb-num-pct> ]?',
    'lab': '<num-pct-none>{3} <alpha>? | ' +
      'from <color> <rel-lab-num-pct>{3} [ / <rel-lab-num-pct> ]?',
    'lch': '<num-pct-none>{2} [ <hue> | none ] <alpha>? | ' +
      'from <color> <rel-lch-num-pct>{2} [ <hue> | <rel-lch> ] [ / <rel-lch-num-pct> ]?',
    'light-dark': '<color>#{2}',
    'rgb': '[ <num>#{3} | <pct>#{3} ] [ , <num-pct0+> ]? | ' +
      '<num-pct-none>{3} <alpha>? | ' +
      'from <color> <rel-rgb-num-pct>{3} [ / <rel-rgb-num-pct> ]?',
  },
  filter: {
    __proto__: null,
    'blur': '<len>?',
    'brightness': '<num-pct>?',
    'contrast': '<num-pct>?',
    'drop-shadow': '[ <len>{2,3} && <color>? ]?',
    'grayscale': '<num-pct>?',
    'hue-rotate': '<angle-or-0>?',
    'invert': '<num-pct>?',
    'opacity': '<num-pct>?',
    'saturate': '<num-pct>?',
    'sepia': '<num-pct>?',
  },
  basicShape: {
    'circle': '<shape-radius> [ at <position> ]?',
    'ellipse': '[ <shape-radius>{2} ]? [ at <position> ]?',
    'inset': '<inset-arg>',
    'path': '[ <fill-rule> , ]? <string>',
    'polygon': '[ <fill-rule> , ]? [ <len-pct> <len-pct> ]#',
    'rect': '<rect-arg>',
    'xywh': '<xywh-arg>',
  },
  transform: {
    __proto__: null,
    matrix: '<num>#{6}',
    matrix3d: '<num>#{16}',
    perspective: '<len0+> | none',
    rotate: '<angle-or-0> | none',
    rotate3d: '<num>#{3} , <angle-or-0>',
    rotateX: '<angle-or-0>',
    rotateY: '<angle-or-0>',
    rotateZ: '<angle-or-0>',
    scale: '[ <num-pct> ]#{1,2} | none',
    scale3d: '<num-pct>#{3}',
    scaleX: '<num-pct>',
    scaleY: '<num-pct>',
    scaleZ: '<num-pct>',
    skew: '<angle-or-0> [ , <angle-or-0> ]?',
    skewX: '<angle-or-0>',
    skewY: '<angle-or-0>',
    translate: '<len-pct>#{1,2} | none',
    translate3d: '<len-pct>#{2} , <len>',
    translateX: '<len-pct>',
    translateY: '<len-pct>',
    translateZ: '<len>',
  },
};

{
  let obj = VTFunctions.color;
  for (const k of ['hsl', 'rgb']) obj[k + 'a'] = obj[k];
  for (const k of ['lab', 'lch']) obj['ok' + k] = obj[k];
  obj = VTFunctions.transform;
  for (const key in obj) {
    const low = key.toLowerCase();
    if (low !== key) Object.defineProperty(obj, low, {value: obj[key], writable: true});
  }
}

export default VTFunctions;
