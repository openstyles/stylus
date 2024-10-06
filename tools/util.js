'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const chalk = require('chalk');
const postcss = require('postcss');
const postcssPresetEnv = require('postcss-preset-env');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

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

function addReport(base, {entry}) {
  base.plugins = [
    ...base.plugins || [],
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: base.output.path + '/.' + Object.keys(entry).join('-') + '.report.html',
    }),
  ];
}

function defineVars(vars) {
  const env = {};
  for (const k in vars) {
    env['process.env.' + k] = JSON.stringify(vars[k]);
  }
  return new webpack.DefinePlugin(env);
}

function stripSourceMap(isDev, buf, from) {
  const str = buf.toString();
  const map = from + '.map';
  const res = str.replace(/(\r?\n\/\/# sourceMappingURL=).+/,
    !isDev || !fs.existsSync(map) ? '' :
      '$1data:application/json;charset=utf-8;base64,' +
      fs.readFileSync(map).toString('base64'));
  return Buffer.from(res);
}

module.exports = {
  addReport,
  defineVars,
  stripSourceMap,
  transpileCss,
  SKIP: [
    '.*', // dot files/folders (glob, not regexp)
    'dist',
    'images/icons',
    'node_modules',
    'tools',
  ],
};
