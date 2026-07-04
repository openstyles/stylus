'use strict';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.dirname(__dirname.replaceAll('\\', '/')) + '/';
const SRC = ROOT + 'src/';

const JOB = process.env.npm_lifecycle_event || process.argv.slice(2).join('-');
const CMD = JOB.match(/^(build|watch|serve)(?=-|$)/)?.[0];
const BUILD = JOB.match(/(?<=-|^)(chrome|firefox|any)(?=-|$)/)?.[0] || 'any';
const FLAVOR = JOB.match(/(?<=-|^)(mv\d)(?=-|$)/)?.[0] || 'mv2';
const TARGET = `${BUILD}-${FLAVOR}`;
const DEV = CMD === 'watch';
const HMR = CMD === 'serve';
const MV3 = FLAVOR === 'mv3';

const MANIFEST = 'manifest.json';
const MANIFEST_OVR = `manifest-${FLAVOR}.json`;

/** Nuking comments and whitespace between tags on separate lines as we don't rely on it.
 * The only exception we use is a same-line space e.g. <b>foo</b> <b>bar</b>  */
const RX_HTML_WS = /^\s+|(?<=[>"',.]|&nbsp;)[ \t]*[\r\n]\s*|\s+(?=>|<\/)|<!--.*?-->|\s+$/gs;
const nukeHtmlSpaces = str => str.replace(RX_HTML_WS, '');

const makePatchOptions = entries => entries.map(([what, ...rules]) => ({
  ...`${what}` === '[object Object]'
    ? what
    : {test: what.test ? what : require.resolve(what)},
  loader: 'string-replace-loader',
  options: {
    multiple: rules.map(r => ({search: r[0], replace: r[1], strict: true})),
  },
}));

function anyPathSep(str) {
  return str.replace(/[\\/]/g, /[\\/]/.source);
}

function escapeForRe(str) {
  return str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
}

function escapeToRe(str, flags) {
  return new RegExp(str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&'), flags);
}

function getBrowserTargets() {
  return [
    BUILD !== 'firefox' && ['chrome', require(SRC + MANIFEST_OVR).minimum_chrome_version],
    BUILD !== 'chrome' && ['firefox', require(SRC + MANIFEST_OVR.replace('.', '-firefox.'))
      .browser_specific_settings.gecko.strict_min_version],
  ].filter(Boolean);
}

function getBrowserlist() {
  return getBrowserTargets()
    .map(([name, ver]) => ver && `${name} >= ${parseFloat(ver)}`);
}

function transESM2var(buf, from) {
  const code = transSourceMap(buf, from, transESM2var).replace(/^import.+/, '');
  const i = code.lastIndexOf('\nexport');
  const j = code.indexOf('\n', i + 1);
  const name = Object.assign(/{\s*(\w+)/g, {lastIndex: i}).exec(code)[1];
  const varFn = `'use strict'; var ${name} = (() => {${code.slice(0, i)}\nreturn ${name};})();` +
    code.slice(j);
  if (MV3) return varFn;
  const res = babel.transformSync(varFn, {
    compact: !DEV,
    minified: !DEV,
    sourceMaps: DEV && 'inline',
  });
  return res.code;
}

function transSourceMap(buf, from, mode) {
  const str = buf.toString();
  const map = from + '.map';
  const res = str.replace(/(\r?\n\/\/# sourceMappingURL=).+/,
    typeof this?.map === 'string' ? '$1' + this.map :
    mode !== transESM2var || !DEV || !fs.existsSync(map) ? '' :
      '$1data:application/json;charset=utf-8;base64,' +
      fs.readFileSync(map).toString('base64'));
  return this?.patch?.(res) ?? res;
}

module.exports = {
  BUILD,
  CM_PACKAGE_PATH: path.dirname(require.resolve('codemirror/package.json')) + path.sep,
  DEV,
  FLAVOR,
  HMR,
  MANIFEST,
  MV3,
  ROOT,
  SRC,
  TARGET,
  anyPathSep,
  escapeForRe,
  escapeToRe,
  getBrowserlist,
  getBrowserTargets,
  makePatchOptions,
  nukeHtmlSpaces,
  transESM2var,
  transSourceMap,
};
