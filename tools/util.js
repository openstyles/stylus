'use strict';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const MANIFEST = 'manifest.json';
const ROOT = path.dirname(__dirname.replaceAll('\\', '/')) + '/';
const SRC = ROOT + 'src/';

const [TARGET, ZIP] = process.env.NODE_ENV?.split(':') || [''];
const [BUILD, FLAVOR, CHANNEL] = TARGET.split('-');
const MV3 = FLAVOR === 'mv3';
const DEV = process.env.npm_lifecycle_event?.startsWith('watch');

/** Nuking redundant quotes https://html.spec.whatwg.org/multipage/syntax.html#syntax-attributes */
const RX_HTML_ATTR = /(?<=<[^<>]+\s[-\w]+=)"([^"'`=<>\s]+)"(?:\s+?(?=>|\s\S))?/g;
/** Nuking comments and whitespace between tags on separate lines as we don't rely on it.
 * The only exception we use is a same-line space e.g. <b>foo</b> <b>bar</b>  */
const RX_HTML_WS = /^\s+|(?<=>|&nbsp;)[ \t]*[\r\n]\s*|<!--.*?-->|\s+$/gs;
const nukeHtmlSpaces = str => str.replace(RX_HTML_WS, '').replace(RX_HTML_ATTR, '$1');

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
  const FF = parseFloat(mj.browser_specific_settings?.gecko.strict_min_version);
  const CH = parseFloat(mj.minimum_chrome_version);
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

function transBabel(buf, from) {
  const res = babel.transformSync(transSourceMap(buf, from), {
    minified: !DEV,
    sourceMaps: DEV && 'inline',
  });
  return res.code;
}

function transESM2var(buf, from) {
  const code = transSourceMap(buf, from).replace(/^import.+/, '');
  const i = code.lastIndexOf('\nexport');
  const j = code.indexOf('\n', i + 1);
  const name = Object.assign(/{\s*(\w+)/g, {lastIndex: i}).exec(code)[1];
  const varFn = `var ${name} = (() => {${code.slice(0, i)}\nreturn ${name};})();${code.slice(j)}`;
  if (MV3) return varFn;
  const res = babel.transformSync(varFn, {
    compact: !DEV,
    minified: !DEV,
    sourceMaps: DEV && 'inline',
  });
  return res.code;
}

function transSourceMap(buf, from) {
  const str = buf.toString();
  const map = from + '.map';
  const res = str.replace(/(\r?\n\/\/# sourceMappingURL=).+/,
    !DEV || !fs.existsSync(map) ? '' :
      '$1data:application/json;charset=utf-8;base64,' +
      fs.readFileSync(map).toString('base64'));
  return res;
}

module.exports = {
  BUILD,
  CHANNEL,
  DEV,
  FLAVOR,
  MANIFEST,
  MV3,
  ROOT,
  SRC,
  TARGET,
  ZIP,
  addReport,
  anyPathSep,
  escapeForRe,
  escapeToRe,
  getBrowserlist,
  getManifestOvrName,
  nukeHtmlSpaces,
  transBabel,
  transESM2var,
  transSourceMap,
};
