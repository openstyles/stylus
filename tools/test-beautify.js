'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const less = require('less');

(async () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/vendor-overwrites/beautify/beautify-css-mod.js'), 'utf8');
  const {default: beautify} = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const cases = [
    ['nested :not', 'table{tr:not(:nth-child(2), :last-child){display:none}}',
      'tr:not(:nth-child(2), :last-child)'],
    ['conditional rule',
      '@supports(display:grid){a:-webkit-any(:hover, :active, :focus){color:red}}',
      'a:-webkit-any(:hover, :active, :focus)'],
    ['UserCSS document rule',
      '@-moz-document domain("example.com"){.a{.b:is(:hover, :focus){color:red}}}',
      '.b:is(:hover, :focus)'],
    ['nested functions', '.a{.b:is(:not(:hover, :focus), :has(> .c)){color:red}}',
      '.b:is(:not(:hover, :focus), :has(> .c))'],
    ['pseudo-element', '.a{.b:where(:hover, :focus)::before{content:"text"}}',
      '.b:where(:hover, :focus)::before'],
    ['quoted terminator', '.a{.b:is(:hover, :focus[title=";"]){color:red}}',
      '.b:is(:hover, :focus[title=";"])'],
    ['quoted closing brace', '.a{.b:is(:hover, :focus[title="}"]){color:red}}',
      '.b:is(:hover, :focus[title="}"])'],
    ['quoted parenthesis', '.a{.b:is(:hover, :focus[title=")"]){color:red}}',
      '.b:is(:hover, :focus[title=")"])'],
    ['comment terminator', '.a{.b:hover/* ; } ) */{color:red}}', '.b:hover'],
    ['escaped terminator', String.raw`.a{.b:is(:hover, :focus[title=\;]){color:red}}`,
      String.raw`.b:is(:hover, :focus[title=\;])`],
    ['escaped parenthesis', String.raw`.a{.b\):is(:hover, :focus){color:red}}`,
      String.raw`.b\):is(:hover, :focus)`],
    ['quoted URL', '.a{background:url("x");.b:is(:hover, :focus){color:red}}',
      '.b:is(:hover, :focus)'],
    ['empty URL', '.a{background:url();.b:is(:hover, :focus){color:red}}',
      '.b:is(:hover, :focus)'],
    ['unquoted URL', '.a{background:url(x);.b:is(:hover, :focus){color:red}}',
      '.b:is(:hover, :focus)'],
    ['descendant pseudo', '.a{.b :is(:hover, :focus){color:red}}',
      '.b :is(:hover, :focus)'],
    ['Sass selector interpolation', '$i:2;.a{:nth-child(#{$i}){color:red}}',
      ':nth-child(#{$i})'],
    ['Less selector interpolation', '@i:2;.a{:nth-child(@{i}){color:red}}',
      ':nth-child(@{i})'],
    ['interpolated selector list', '$suffix:x;.a{:is(.x#{$suffix}, :hover){color:red}}',
      ':is(.x#{$suffix}, :hover)'],
    ['escaped opening parenthesis', String.raw`.a{.b\(:is(:hover, :focus){color:red}}`,
      String.raw`.b\(:is(:hover, :focus)`],
  ];
  for (const [name, css, selector] of cases) {
    test(name, () => {
      const output = beautify(css);
      assert.ok(output.includes(selector), output);
      assert.equal(beautify(output), output, 'formatting must be idempotent');
    });
  }
  test('declarations and string contents', () => {
    const css = '.a{color:var(--color, red);content:"{;})";background:url("data:x;y:z")}';
    const output = beautify(css);
    for (const value of ['color: var(--color, red)', 'content: "{;})"',
      'background: url("data:x;y:z")']) assert.ok(output.includes(value), output);
  });
  test('Less and Sass values', () => {
    for (const css of ['@color:red;.a{color:@color}', '$color:red;.a{color:$color}']) {
      const output = beautify(css);
      assert.ok(output.includes('color: '), output);
      assert.equal(beautify(output), output);
    }
  });
  test('Less selector interpolation compiles unchanged', async () => {
    for (const css of ['@i:2;.a{:nth-child(@{i}){color:red}}',
      '@suffix:x;.a{:is(.x@{suffix}, :hover){color:red}}']) {
      const before = await less.render(css);
      const after = await less.render(beautify(css));
      assert.equal(after.css, before.css);
    }
  });
  test('cursor translation through nested selectors', () => {
    const css = 'table{tr:not(:nth-child(2), :last-child){display:none;}}';
    const tokens = ['last-child', 'display', 'none'];
    const positions = tokens.map(token => ({line: 0, ch: css.indexOf(token) + 2}));
    const output = beautify(css, {translate_positions: positions});
    for (const [i, token] of tokens.entries()) {
      const {line, ch} = positions[i];
      assert.equal(output.split('\n')[line].slice(ch, ch + token.length - 2), token.slice(2));
    }
  });
})();
