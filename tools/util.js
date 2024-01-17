'use strict';

const fse = require('fs-extra');
const chalk = require('chalk');
const postcss = require('postcss');
const postcssPresetEnv = require('postcss-preset-env');

async function *transpileCss(files, isFirefox, mj = fse.readJsonSync('manifest.json')) {
  const pc = postcss([
    postcssPresetEnv({
      browsers: isFirefox
        ? 'Firefox >= ' + mj.browser_specific_settings.gecko.strict_min_version
        : 'Chrome >= ' + mj.minimum_chrome_version,
      features: {
        'prefers-color-scheme-query': false, // we manually handle it via cssRules
      },
    }),
  ]);
  for (const f of files) {
    const [path, text, ...more] = f;
    const res = await pc.process(text, {map: false, from: null});
    const err = res.messages
      .map(m => chalk.red(`${chalk.bold(path)} ${m.line}:${m.column} `) + m.text)
      .join('\n');
    if (err) throw err;
    yield [path, res.css, ...more];
  }
}

exports.SKIP = [
  '.*', // dot files/folders (glob, not regexp)
  'dist',
  'images/icons',
  'node_modules',
  'tools',
];
exports.transpileCss = transpileCss;
