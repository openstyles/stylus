'use strict';

const fs = require('fs');
const svg2ttf = require('svg2ttf');
const svgicons2svgfont = require('svgicons2svgfont');
const ROOT = require.resolve('../package.json').replace(/[^/\\]+$/, '');

const SVG_MAP = Object.entries({
  'check1': '✓',
  'check2': '✔',
  'checked': '☑',
  'close': '✖',
  'config': '⚙',
  'edit': '✏',
  'external': '↗',
  'info': 'ⓘ',
  'install': '↲',
  'log': '◴',
  'menu': '⋮',
  'minus': '➖',
  'plus': '➕',
  'reorder': '↕',
  'select-arrow': '▼',
  'sort-down': '\uE000', // must be in PUA range because the symbol is used along with normal fonts
  'undo': '↶',
  'update-check': '⟳',
  'v': '⋁',
});
const SVG_DIR = ROOT + '.icons/';
const CSS_FILE = ROOT + 'global.css';
const CSS_FONT = ROOT + 'icons.ttf';
const CMT = '/*AUTO-GENERATED-ICON*/';
const CMT_RANGE = '/*AUTO-GENERATED-ICON-RANGE*/';
const CSS_ICON = `${CMT} .i-$NAME::after { content: "$CHAR"; }`;

let svgText = '';
const fontStream = new svgicons2svgfont({
  fontName: 'icons',
  fontHeight: 1024,
  log: (str, ...args) => !/normalize option may help/.test(str) && console.log(str, ...args),
});
fontStream.on('data', s => (svgText += s)).on('end', convert);

for (const [name, char] of SVG_MAP) {
  const file = SVG_DIR + name + '.svg';
  const glyph = fs.createReadStream(file);
  glyph.metadata = {name, file, unicode: [char]};
  fontStream.write(glyph);
}
fontStream.end();

function convert() {
  const ttf = svg2ttf(svgText, {
    familyname: 'icons',
    description: '-',
    ts: 0,
    url: '-',
    version: '1.0',
  });
  const cssText = fs.readFileSync(CSS_FILE, 'utf8');
  const [rxStripCMT, rxStripRANGE] = [CMT, CMT_RANGE].map(c =>
    new RegExp(c.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&') + '.*\\s*', 'g'));
  const LF = cssText.match(/\r?\n/)[0];

  const glyphs = SVG_MAP
    .map(([name, char]) => CSS_ICON.replaceAll('$NAME', name).replaceAll('$CHAR', char))
    .join(LF);

  const range = SVG_MAP
    .map(([, char]) => 'U+' + char.charCodeAt(0).toString(16))
    .sort()
    .join(',');

  const newText =
    cssText
      .replace(rxStripCMT, '')
      .replace(rxStripRANGE, `${CMT_RANGE} U+20,${range};${LF}`)
      .trim() +
    LF + LF +
    glyphs +
    LF;
  if (cssText !== newText) {
    fs.writeFileSync(CSS_FILE, newText, 'utf8');
  }

  fs.writeFileSync(CSS_FONT, Buffer.from(ttf.buffer));
}
