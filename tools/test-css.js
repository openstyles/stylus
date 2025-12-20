'use strict';

const fs = require('fs');
const chalk = require('chalk');
const csslint = require('csslint-mod').default;
const glob = require('fast-glob');
const postcss = require('postcss');
const {SRC} = require('./util');

(async () => {
  testGlobalCss();
  await testParserlibOnFiles();
  console.log(chalk.green('CSS tests OK'));
  process.exit(0);
})();

function fail(what, str) {
  console.log('\r' + chalk.bgRed(what + ' FAILED\n') + str);
  process.exit(1);
}

function testGlobalCss() {
  const css = fs.readFileSync(SRC + 'css/global.css', {encoding: 'utf8'});
  const RX_SUPPRESSOR = /[^{}]+#\\1\s?transition-suppressor[^{}]+{\s*transition:\s*none\s*!\s*important/i;
  const RX_COMMENT = /\/\*([^*]+|\*(?!\/))*(\*\/|$)/g;
  if (!RX_SUPPRESSOR.test(css.replace(RX_COMMENT, ''))) {
    fail('global.css', chalk.red('missing the transition suppressor rule'));
  }
}

async function testParserlibOnFiles() {
  let pc, pcPlugins, m, err;
  const evidenceSize = 2;
  for (const file of glob.sync(SRC + '**/*.css')) {
    let text = fs.readFileSync(file, 'utf8');
    let lines;
    if ((m = text.match(/\/\*\s*(postcss-.+?)\s*\*\//))) {
      if (m[1] !== pcPlugins) {
        pcPlugins = m[1];
        pc = postcss(pcPlugins.split(/\s*,\s*|\s+/).map(s => require(s)));
      }
      text = await pc.process(text, {map: false, from: null});
      text = text.css;
    }
    for (m of csslint.verify(text, {
      'duplicate-properties': 1,
      'errors': 2,
      'known-properties': 1,
      'known-pseudos': 1,
      'selector-newline': 1,
      'simple-not': 2,
      'warnings': 1,
    }).messages) {
      lines ??= text.split('\n');
      const from = m.line - evidenceSize - 1;
      const evidence = lines.slice(from, m.line + evidenceSize).map((s, i) => {
        i += from + 1;
        s = `${i}: ${s}\n`;
        return '\t' + (i === m.line ? chalk.underline(s) : s);
      });
      const msg1 = `${chalk.bold(file.slice(SRC.length))} [${m.rule.id}] ${m.message}\n`;
      const isErr = m.type === 'error';
      console.log(isErr ? chalk.red(msg1) : msg1);
      console.log(chalk.dim(evidence.join('')));
      err ||= isErr;
    }
  }
  if (err) process.exit(1);
}
