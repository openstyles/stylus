'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const ROOT = path.dirname(__dirname.replaceAll('\\', '/')) + '/';
const SRC = ROOT + 'src/';

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

function anyPathSep(str) {
  return str.replace(/[\\/]/g, /[\\/]/.source);
}

function defineVars(vars) {
  const env = {};
  for (const k in vars) {
    env['process.env.' + k] = JSON.stringify(vars[k]);
  }
  return new webpack.DefinePlugin(env);
}

function escapeRe(str) {
  return str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
}

function getBrowserlist() {
  const mj = require(SRC + 'manifest.json');
  return [
    'Firefox >= ' + mj.browser_specific_settings.gecko.strict_min_version,
    'Chrome >= ' + mj.minimum_chrome_version,
  ];
}

function stripSourceMap(buf, from) {
  const str = buf.toString();
  const map = from + '.map';
  const res = str.replace(/(\r?\n\/\/# sourceMappingURL=).+/,
    process.env.NODE_ENV !== 'DEV' || !fs.existsSync(map) ? '' :
      '$1data:application/json;charset=utf-8;base64,' +
      fs.readFileSync(map).toString('base64'));
  return Buffer.from(res);
}

module.exports = {
  ROOT,
  SRC,
  addReport,
  anyPathSep,
  defineVars,
  escapeRe,
  getBrowserlist,
  stripSourceMap,
};
