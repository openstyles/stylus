'use strict';

const fs = require('fs');
const parserlib = require('csslint-mod/dist/parserlib').default;
const csslintmod = require('csslint-mod').default;
const {SRC} = require('./util.js');

const {ScopedProperties, NamedColors, Properties, Parser: {AT}} = parserlib.css;
const ver = 'csslint-mod ' + require('csslint-mod/package.json').version;
const signature = '// AUTO-GENERATED FROM ';
const header = signature + ver;

const fpath = SRC + 'cm/css-data.js';
const [oldBase, oldHeader, oldText] = fs.readFileSync(fpath, 'utf8')
  .split(new RegExp(`(${signature}.+)`));
if (oldHeader === header)
  process.exit(0);

const colorsLC = NamedColors.join(' ').toLowerCase();
const counterProps = Object.keys(ScopedProperties['counter-style']).join("', '");
const fontProps = Object.keys(ScopedProperties['font-face']).join("', '");
const nonstd = [];
const props = Object.keys(Properties)
  .filter(k => !k.startsWith('<') && (Properties[k] !== -1 || !nonstd.push(k)))
  .concat(...Object.values(ScopedProperties).map(Object.keys))
  .sort();
const pseudosFuncStr = `${csslintmod.rules['known-pseudos'].init}`;
const rxPseudos = /(?<=\s+['"])[-\w]+['"]:.+?(?=[,/]|$)/g;
const pseudos = pseudosFuncStr
  .match(/['"]\w+['"]:[^}]+/g)
  .flatMap((pd, i) => pd.match(rxPseudos).flatMap(makePseudo, !i || null))
  .sort();
const values = [
  ...Object.values(Properties),
  ...Object.values(ScopedProperties).flatMap(Object.values),
  ...Object.values(parserlib.util.VTComplex).map(v => typeof v === 'string' && v),
].filter(Boolean).join(' ').match(/(?<=^|[\s|&[\]])-?[a-z][-\w]*(?=[\s[\]|&]|$)/gi).sort();

const makeUniqString = arr => [...new Set(arr)].join(' ').toLowerCase();
const text = /*language=js*/ `
export const atRules = ['${Object.keys(AT).join("', '")}'];
export const colorKeywords = /*@__PURE__*/'${colorsLC}'.split(' ');
export const counterDescriptors = ['${counterProps}'];
export const fontProperties = ['${fontProps}'];
export const nonStandardPropertyKeywords = ['${nonstd.join("', '")}'];
export const propertyKeywords = /*@__PURE__*/'${makeUniqString(props)}'.split(' ');
export const pseudos = /*@__PURE__*/'${makeUniqString(pseudos)}'.split(' ');
export const valueKeywords = /*@__PURE__*/'${makeUniqString(values)}'.split(' ');
`;

if (oldText !== text) {
  fs.writeFileSync(fpath, oldBase + header + text, 'utf8');
  console.log(`Regenerated css-data.js from ${ver}`);
}

function makePseudo(str) {
  const [key, v] = str.split(/['"]/);
  return v.includes('DEAD') ? [] : (
    +v && this ? key :
    v.includes('FuncToo') ? `${key} ${key}(` :
    v.includes('Func') ? key + '(' :
    key
  ).replace(/\S+/g,
    `$&${v.includes('WK') ? ' -webkit-$&' : ''}${v.includes('Moz') ? ' -moz-$&' : ''}`
  ).split(' ');
}
