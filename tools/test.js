'use strict';

const fs = require('fs');

testGlobalCss();

function testGlobalCss() {
  const css = fs.readFileSync('global.css', {encoding: 'utf8'});
  const ERR = 'global.css: missing the transition suppressor rule';
  const RX_SUPPRESSOR = /[^{}]+#\\1\s?transition-suppressor[^{}]+{\s*transition:\s*none\s*!\s*important/i;
  const RX_COMMENT = /\/\*([^*]+|\*(?!\/))*(\*\/|$)/g;
  if (!RX_SUPPRESSOR.test(css.replace(RX_COMMENT, ''))) {
    console.error(ERR);
    process.exit(1);
  }
}
