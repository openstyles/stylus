'use strict';

const fs = require('fs');
const chalk = require('chalk');
const glob = require('fast-glob');
const postcss = require('postcss');
const {SRC} = require('./util');

/**
 * Usage notes:
 * When testCsslint() fails, it creates a temporary report file.
 * Inspect it and either fix the source code or rename it to overwrite test-css-report.txt.
*/

const TEST_FILE = __dirname + '/test-css.txt';
const REPORT_FILE = TEST_FILE.replace('.txt', '-report.txt');
const FAILED_FILE = REPORT_FILE.replace('.txt', '.tmp.txt');

(async () => {
  let res;
  for (const [fn, msg] of [
    [testGlobalCss],
    [testCsslint, 'Testing csslint...'],
    [testParserlib, 'Testing parserlib internals...'],
    [testParserlibOnFiles, 'Testing parserlib on all css files...'],
  ]) {
    if (msg) process.stdout.write(msg);
    res = fn(res);
    if (res instanceof Promise) res = await res;
    if (msg) console.log(' OK');
  }
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

async function testCsslint() {
  const {default: csslint} = await import(SRC + 'js/csslint/csslint');
  const rules = {...csslint.getRuleSet(), 'style-rule-nesting': 0};
  const report = csslint
    .verify(fs.readFileSync(TEST_FILE, 'utf8'), rules)
    .messages.map(m => `${m.type}\t${m.line}\t${m.col}\t${m.message}`);
  const expected = fs.readFileSync(REPORT_FILE, 'utf8').trim().split(/\r?\n/);
  let a, b, i, err;
  for (i = 0; (a = report[i]) && (b = expected[i]); i++) {
    if (a !== b) {
      err = chalk.red(`\n* RECEIVED: ${a}\n`) + `  EXPECTED: ${b}\n`;
      break;
    }
  }
  i = report.length - expected.length;
  if (i) {
    a = Math.abs(i);
    err = (err || '') + '\n' +
      (i > 0 ? `Found ${a} extra un` : `Did not find ${a} `) +
      `expected problem${a === 1 ? '' : 's'}:\n  * ` +
      (i > 0 ? report : expected).slice(-a).join('\n  * ');
  }
  if (err) {
    fs.writeFileSync(FAILED_FILE, report.join('\n'), 'utf8');
    fail('csslint', err);
  }
}

async function testParserlib() {
  const {default: parserlib} = await import(SRC + 'js/csslint/parserlib');
  const {Matcher} = parserlib.util;
  for (const obj of [
    parserlib.css.Properties,
    parserlib.util.VTComplex,
    ...Object.values(parserlib.util.VTFunctions),
  ]) {
    for (const spec of Object.values(obj)) {
      if (typeof spec === 'string' && !Matcher.cache[spec]) {
        Matcher.parse(spec);
      }
    }
  }
  return parserlib;
}

function testParserlibOnFiles(parserlib) {
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
  const opts = parser.options;
  let pc, pcPlugins, m;
  return Promise.all(glob.sync(SRC + '**/*.css').map(async file => {
    process.stdout.write('.');
    let text = fs.readFileSync(file, 'utf8');
    if ((m = text.match(/\/\*\s*(postcss-.+?)\s*\*\//))) {
      if (m[1] !== pcPlugins) {
        pcPlugins = m[1];
        pc = postcss(pcPlugins.split(/\s*,\s*|\s+/).map(s => require(s)));
      }
      text = await pc.process(text, {map: false, from: null});
      text = text.css;
    }
    opts.topDocOnly = true; parser.parse(text);
    opts.topDocOnly = false; parser.parse(text);
    opts.globalsOnly = true; parser.parse(text);
    opts.globalsOnly = false;
    if (logStr) fail('parserlib', `\n${chalk.red(file)}\n${logStr}`);
    return [file, text];
  }));
}
