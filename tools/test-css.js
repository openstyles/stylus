'use strict';

const fs = require('fs');
const chalk = require('chalk').default;
const csslint = require('csslint-mod').default;
const glob = require('fast-glob');
const postcss = require('postcss');
const {SRC} = require('./util');

(async () => {
  await testParserlibOnFiles();
  console.log(chalk.green('CSS tests OK'));
  process.exit(0);
})();

async function testParserlibOnFiles() {
  let pc, pcPlugins, m, err;
  const evidenceSize = 2;
  for (const file of glob.sync(SRC + '**/*.css')) {
    let text = fs.readFileSync(file, 'utf8');
    let lines;
    if (/\$\w|@import\s+['"][@.]/.test(text)) {
      pcPlugins ||= [
        require('postcss-import'),
        require('postcss-simple-vars'),
      ];
      pc = postcss(pcPlugins);
      text = await pc.process(text, {map: false, from: file});
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
