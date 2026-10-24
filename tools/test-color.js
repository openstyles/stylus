'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {test} = require('node:test');

(async () => {
  const src = path.join(__dirname, '../src/js');
  const source = fs.readFileSync(path.join(src, 'color/color-converter.js'), 'utf8')
    .replace("'@/js/consts'", JSON.stringify(pathToFileURL(path.join(src, 'consts.js')).href));
  const {default: Color} = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

  test('modern hsl/hwb accept plain numbers for saturation/lightness', () => {
    for (const [input, expected] of [
      ['hsl(200 50 50)', 'hsl(200 50 50)'],
      ['hsl(200 50% 50 / .5)', 'hsl(200 50% 50 / 0.5)'],
      ['hwb(200 10 20)', 'hwb(200 10 20)'],
    ]) {
      const color = Color.parse(input);
      assert.ok(color, input);
      assert.equal(color.toString(), expected);
    }
    const rgb = str => {
      const {x, y, z} = Color.parse(str).to(2/*COLOR_RGB*/);
      return [x, y, z].map(Math.round);
    };
    assert.deepEqual(rgb('hsl(200 50 50)'), rgb('hsl(200 50% 50%)'));
    assert.deepEqual(rgb('hwb(200 10 20)'), rgb('hwb(200 10% 20%)'));
  });

  test('legacy comma-separated hsl still requires percentages', () => {
    assert.equal(Color.parse('hsl(200, 50, 50)'), undefined);
    assert.equal(Color.parse('hsl(200, 50%, 50%)').toString(), 'hsl(200, 50%, 50%)');
  });
})();
