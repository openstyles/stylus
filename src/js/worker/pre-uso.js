import Color from '@/js/color/color-converter';
import {COLOR_HEX, COLOR_RGB} from '@/js/consts';

export default function preUso(code, metaStr, vars) {
  const pool = Object.create(null);
  const reCmt = /\/\*\[\[([\w-]+)]]\*\/([0-9a-f]{2}(?=\W)|)/gi;
  const doReplace = text => text.replace(reCmt, (s, name, hexAlpha) => {
    const key = hexAlpha ? name + '[A]' : name;
    const val = key in pool ? pool[key] : pool[key] = getValue(name, hexAlpha);
    return val ?? s;
  });
  const getValue = (name, hexAlpha) => {
    let rgb;
    let v = vars[name] || (rgb = name.endsWith('-rgb')) && vars[name.slice(0, -4)];
    let {type, value} = v || {};
    if (type === 'dropdown' || type === 'select') {
      pool[name] = ''; // prevent infinite recursion
      value = doReplace(value);
    } else if (type === 'color' && (hexAlpha || rgb) && (v = Color.parse(value))) {
      if (hexAlpha) v.a = 1;
      value = v.toString(rgb ? COLOR_RGB : COLOR_HEX, {uso: hexAlpha || rgb}) + hexAlpha;
    }
    return value;
  };
  return vars ? doReplace(code) : code;
}
