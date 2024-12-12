import Bucket from './bucket';
import {GlobalKeywords, isOwn} from './util';
import {ANGLE, IDENT, LENGTH, NUMBER, PCT, RESOLUTION, STRING, TIME, URANGE} from './tokens';

const buAlpha = new Bucket('alpha');
export const buGlobalKeywords = new Bucket(GlobalKeywords);

const VTSimple = {
  __proto__: null,
  '<animateable-feature-name>': customIdentChecker('will-change,auto,scroll-position,contents'),
  '<angle>': p => p.isCalc || p.id === ANGLE,
  '<angle-or-0>': p => p.isCalc || p.is0 || p.id === ANGLE,
  '<ascii4>': p => p.id === STRING && p.length === 4 && !/[^\x20-\x7E]/.test(p.text),
  '<attr>': p => p.isAttr,
  '<custom-ident>': p => p.id === IDENT && !buGlobalKeywords.has(p),
  '<custom-prop>': p => p.type === '--',
  '<flex>': p => p.isCalc || p.units === 'fr' && p.number >= 0,
  '<func>': p => p.type === 'fn',
  '<hue>': p => p.isCalc || p.id === NUMBER || p.id === ANGLE,
  '<ident>': p => p.id === IDENT,
  '<ident-for-grid>': customIdentChecker('span,auto'),
  '<ident-not-none>': p => p.id === IDENT && !p.isNone,
  '<ie-function>': p => p.ie,
  '<int>': p => p.isCalc || p.isInt,
  '<int0-1>': p => p.isCalc || p.is0 || p.isInt && p.number === 1,
  '<int0+>': p => p.isCalc || p.isInt && p.number >= 0,
  '<int1+>': p => p.isCalc || p.isInt && p.number > 0,
  '<int2-4>': p => p.isCalc || p.isInt && (p = p.number) >= 2 && p <= 4,
  '<len>': p => p.isCalc || p.is0 || p.id === LENGTH,
  '<len0+>': p => p.isCalc || p.is0 || p.id === LENGTH && p.number >= 0,
  '<len-pct>': p => p.isCalc || p.is0 || p.id === LENGTH || p.id === PCT,
  '<len-pct0+>': p => p.isCalc || p.is0 || p.number >= 0 && (p.id === PCT || p.id === LENGTH),
  '<named-or-hex-color>': p => p.type === 'color',
  '<num>': p => p.isCalc || p.id === NUMBER,
  '<num0+>': p => p.isCalc || p.id === NUMBER && p.number >= 0,
  '<num0-1>': p => p.isCalc || p.id === NUMBER && (p = p.number) >= 0 && p <= 1,
  '<num1-1000>': p => p.isCalc || p.id === NUMBER && (p = p.number) >= 1 && p <= 1000,
  '<num-pct>': p => p.isCalc || p.id === NUMBER || p.id === PCT,
  '<num-pct0+>': p => p.isCalc || p.number >= 0 && (p.id === NUMBER || p.id === PCT),
  '<num-pct-none>': p => p.isCalc || p.isNone || p.id === NUMBER || p.id === PCT,
  '<pct>': p => p.isCalc || p.is0 || p.id === PCT,
  '<pct0+>': p => p.isCalc || p.is0 || p.number >= 0 && p.id === PCT,
  '<pct0-100>': p => p.isCalc || p.is0 || p.id === PCT && (p = p.number) >= 0 && p <= 100,
  '<keyframes-name>': customIdentChecker('', p => p.id === STRING),
  '<resolution>': p => p.id === RESOLUTION,
  '<string>': p => p.id === STRING,
  '<time>': p => p.isCalc || p.id === TIME,
  '<time0+>': p => p.isCalc || p.id === TIME && p.number >= 0,
  '<unicode-range>': p => p.id === URANGE,
  '<uri>': p => p.uri != null,
};

for (const type of ['hsl', 'hwb', 'lab', 'lch', 'rgb']) {
  const letters = {};
  for (let i = 0; i < type.length;) letters[type.charCodeAt(i++)] = 1;
  VTSimple[`<rel-${type}>`] = p => p.isNone
    || (p.length === 1 ? isOwn(letters, p.code) : p.length === 5 && buAlpha.has(p));
  VTSimple[`<rel-${type}-num-pct>`] = p => p.isNone
    || p.isCalc || p.id === NUMBER || p.id === PCT
    || (p.length === 1 ? isOwn(letters, p.code) : p.length === 5 && buAlpha.has(p));
}

function customIdentChecker(str = '', alt) {
  const b = new Bucket(GlobalKeywords);
  if (str) b.addFrom(str.split(','));
  return p => p.id === IDENT && !b.has(p) || alt && alt(p);
}

export default VTSimple;
