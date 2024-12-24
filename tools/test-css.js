'use strict';

const fs = require('fs');
const chalk = require('chalk');
const glob = require('fast-glob');
const postcss = require('postcss');
const {SRC} = require('./util');

(async () => {
  let res;
  for (const [fn, msg] of [
    [testGlobalCss],
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

async function testParserlibOnFiles() {
  const {default: parserlib} = await import('csslint-mod/dist/parserlib.js');
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
