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

  test('hue units', () => {
    for (const [input, expected] of [
      ['hsl(200deg 50% 50%)', 'hsl(200 50% 50%)'],
      ['hsl(200deg, 50%, 50%)', 'hsl(200, 50%, 50%)'],
      ['hsl(100grad 50% 50%)', 'hsl(90 50% 50%)'],
      ['hsl(.5turn 50% 50%)', 'hsl(180 50% 50%)'],
    ]) {
      const color = Color.parse(input);
      assert.ok(color, input);
      assert.equal(color.toString(), expected);
    }
  });

  test('none stays in its own component', () => {
    assert.equal(Color.parse('hsl(0 none 50%)').toString(), 'hsl(0 none 50%)');
    assert.equal(Color.parse('hsl(10 20% none)').toString(), 'hsl(10 20% none)');
    assert.equal(Color.parse('hwb(none 10% 20%)').toString(), 'hwb(none 10% 20%)');
  });

  test('converting to another format writes valid css', () => {
    const conv = (str, type) => Color.parse(str).toString(type, {round: true});
    assert.equal(conv('hsl(200, 50%, 50%)', 2), 'rgb(64, 149, 191)');
    assert.equal(conv('hsl(200 50% 50%)', 2), 'rgb(64 149 191)');
    assert.equal(conv('rgb(64, 149, 191)', 3), 'hsl(200, 50%, 50%)');
    assert.equal(conv('rgb(25%, 50%, 75%)', 3), 'hsl(210, 50%, 50%)');
    assert.equal(conv('rgb(64, 149, 191)', 4), 'hwb(200, 25%, 25%)');
    assert.equal(conv('#4095bf', 3), 'hsl(200 50% 50%)');
    assert.equal(conv('hsl(none 50% 50%)', 2), 'rgb(191 64 64)');
    // same format keeps the original flags
    assert.equal(conv('rgb(25%, 50%, 75%)', 2), 'rgb(25%, 50%, 75%)');
  });

  test('picker round trip through HSV', () => {
    const pick = (str, type) => Color.parse(str).toHSV().to(type).toString(type, {round: true});
    assert.equal(pick('hsl(200, 50%, 50%)', 2), 'rgb(64, 149, 191)');
    assert.equal(pick('hsl(200, 50%, 50%)', 3), 'hsl(200, 50%, 50%)');
    assert.equal(pick('rgb(25%, 50%, 75%)', 2), 'rgb(25%, 50%, 75%)');
    assert.equal(pick('rgb(64, 149, 191)', 3), 'hsl(200, 50%, 50%)');
  });
})();
