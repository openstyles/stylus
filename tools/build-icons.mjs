import fs from 'fs';
import chalk from 'chalk';
import glob from 'fast-glob';
import path from 'path';
import stream from 'stream';
import svg2ttf from 'svg2ttf';
import {SVGIcons2SVGFontStream} from 'svgicons2svgfont';
import {SRC} from './util.js';

process.stdout.write('Creating icons font: ');

const ERRORS = [];
const SVG_MAP = [];
const SVG_DIR = SRC + 'icons/';
const CSS_FILE = SRC + 'css/global.css';
const CSS_FONT = SRC + 'css/icons.ttf';
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
  if (!char) {
    ERRORS.push(name);
    continue;
  }
  process.stdout.write(char);
  const glyph = stream.Readable.from([text]);
  glyph.metadata = {name, file, unicode: [char]};
  fontStream.write(glyph);
  SVG_MAP.push([name, char]);
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

  console.log(` (${SVG_MAP.length})`, ERRORS[0]
    ? chalk.red(`and ${ERRORS.length} with no id skipped:\n  `) + ERRORS.join('\n  ')
    : chalk.green('OK'));
}
