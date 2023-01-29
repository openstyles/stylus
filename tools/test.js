'use strict';

const fs = require('fs');
const chalk = require('chalk');
const glob = require('glob');

testGlobalCss();
testCsslint();
testParserlib();
console.log(chalk.bgGreen('OK'));
process.exit(0);

function fail(what, str) {
  console.log(chalk.bgRed(what + ' FAILED\n') + str);
  process.exit(1);
}

function testGlobalCss() {
  const css = fs.readFileSync('global.css', {encoding: 'utf8'});
  const RX_SUPPRESSOR = /[^{}]+#\\1\s?transition-suppressor[^{}]+{\s*transition:\s*none\s*!\s*important/i;
  const RX_COMMENT = /\/\*([^*]+|\*(?!\/))*(\*\/|$)/g;
  if (!RX_SUPPRESSOR.test(css.replace(RX_COMMENT, ''))) {
    fail('global.css', chalk.red('missing the transition suppressor rule'));
  }
}

function testCsslint() {
  console.log('Testing csslint...');
  const TEST_FILE = 'tools/test-css.txt';
  const REPORT_FILE = TEST_FILE.replace('.txt', '-report.txt');
  const report = require('../js/csslint/csslint')
    .verify(fs.readFileSync(TEST_FILE, 'utf8'))
    .messages.map(m => `${m.type}\t${m.line}\t${m.col}\t${m.message}`);
  // Change 0 to 1 to update the report file
  if (0) fs.writeFileSync(REPORT_FILE, report.join('\n'), 'utf8');
  const expected = fs.readFileSync(REPORT_FILE, 'utf8').split(/\r?\n/);
  let a, b;
  for (let i = 0; (a = report[i], b = expected[i]); i++) {
    if (a !== b) fail('csslint', chalk.red(`* RECEIVED: ${a}\n`) + `  EXPECTED: ${b}\n`);
  }
  if ((a = report.length) !== (b = expected.length)) {
    fail('csslint', `Found ${a} problems, expected ${b}`);
  }
}

function testParserlib() {
  console.log('Testing parserlib...');
  const parserlib = require('../js/csslint/parserlib');
  const {Matcher} = parserlib.util;
  for (const obj of [
    parserlib.css.Properties,
    parserlib.util.VTComplex,
    parserlib.util.VTFunctions,
  ]) {
    for (const spec of Object.values(obj)) {
      if (typeof spec === 'string' && !Matcher.cache.has(spec)) {
        Matcher.parse(spec);
      }
    }
  }
  const parser = new parserlib.css.Parser({
    ieFilters: true,
    starHack: true,
    underscoreHack: true,
  });
  let logStr = '';
  parser.fire = (e, tok = e) => {
    if ((e.type === 'warning' || e.type === 'error') && !/TEST PASSED/.test(e.message)) {
      const p = e.property;
      logStr += `  * ${tok.line}:${tok.col} [${e.type}] ${p ? p.text + ': ' : ''}${e.message}\n`;
    }
  };
  for (const file of glob.sync('**/*.css', {ignore: ['node_modules/**']})) {
    parser.parse(fs.readFileSync(file, 'utf8'));
    if (logStr) fail('parserlib', `${chalk.red(file)}\n${logStr}`);
  }
}
