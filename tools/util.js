'use strict';

const fs = require('fs');
const path = require('path');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const MANIFEST = 'manifest.json';
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

function escapeForRe(str) {
  return str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
}

function escapeToRe(str, flags) {
  return new RegExp(str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&'), flags);
}

function getBrowserlist() {
  const mj = require(SRC + getManifestOvrName());
  const FF = mj.browser_specific_settings?.gecko.strict_min_version;
  const CH = mj.minimum_chrome_version;
  return [
    FF && 'Firefox >= ' + FF,
    CH && 'Chrome >= ' + CH,
  ].filter(Boolean);
}

function getManifestOvrName(
  mv3 = /-mv3/.test(process.env.NODE_ENV),
  asGlob
) {
  const s = '-mv' + (mv3 ? 3 : 2);
  return MANIFEST.replace('.', asGlob ? `?(${s}).` : s + '.');
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
  MANIFEST,
  ROOT,
  SRC,
  addReport,
  anyPathSep,
  escapeForRe,
  escapeToRe,
  getBrowserlist,
  getManifestOvrName,
  stripSourceMap,
};
