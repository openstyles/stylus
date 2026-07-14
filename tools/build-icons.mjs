import fs from 'fs';
import chalk from 'chalk';
import glob from 'fast-glob';
import path from 'path';
import stream from 'stream';
import svg2ttf from 'svg2ttf';
import ttf2woff2 from 'ttf2woff2';
import {SVGIcons2SVGFontStream} from 'svgicons2svgfont';
import util from './util.js';

process.stdout.write('Creating icons font: ');

const errors = [];
const svgMap = {__proto__: null};
const {SRC} = util;
const SVG_DIR = SRC + 'icons/';
const CSS_FILE = SRC + 'css/global.css';
const CSS_FONT = SRC + 'css/icons.woff2';
const CMT = '/*AUTO-GENERATED-ICON*/';
const CMT_RANGE = '/*AUTO-GENERATED-ICON-RANGE*/';
const CSS_ICON = `${CMT} .i-$NAME::after { content: "$CHAR"; }`;

let svgText = '';
const fontStream = new SVGIcons2SVGFontStream({
  fontName: 'icons',
  fontHeight: 1024,
  log: (str, ...args) => !/normalize option may help/.test(str) && console.log(str, ...args),
});
fontStream.on('data', s => (svgText += s)).on('end', convert);

for (const file of glob.globSync(SVG_DIR + '*.svg')) {
  const name = path.basename(file).split('.')[0];
  const text = fs.readFileSync(file, 'utf8');
  const char = text.match(/<svg[^>]*?\sid="\s*([^\s"]+)\s*"/)?.[1];
  const old = svgMap[char];
  if (!char || old) {
    errors.push(name + (old ? `: "${char}" is already used by ${old}` : ''));
    continue;
  }
  process.stdout.write(char);
  const scaled = text.replace(/<svg[^>]*?viewbox="0 0 (\d+) (?!512")(\d+)"[^>]*/i,
    (s, w, h) => +h === 512 || s.includes('height="512"') ? s
    : s + ` width="${512 / h * w}" height="512"`);
  const glyph = stream.Readable.from([scaled]);
  glyph.metadata = {name, file, unicode: [char]};
  fontStream.write(glyph);
  svgMap[char] = name;
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

  const chars = Object.keys(svgMap);
  const glyphs = chars
    .map(char => CSS_ICON.replaceAll('$NAME', svgMap[char]).replaceAll('$CHAR', char))
    .join(LF);

  const range = chars
    .map(char => 'U+' + char.charCodeAt(0).toString(16))
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

  fs.writeFileSync(CSS_FONT, ttf2woff2(Buffer.from(ttf.buffer)));

  console.log(` (${chars.length})`, errors[0]
    ? chalk.red(`and ${errors.length} with no id skipped:\n  `) + errors.join('\n  ')
    : chalk.green('OK'));
}
