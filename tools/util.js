'use strict';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.dirname(__dirname.replaceAll('\\', '/')) + '/';
const SRC = ROOT + 'src/';

const [TARGET, ZIP] = process.env.NODE_ENV?.split(':') || [''];
const [BUILD, FLAVOR = 'mv2', CHANNEL] = TARGET.split('-');
const MV3 = FLAVOR === 'mv3';
const DEV = process.env.npm_lifecycle_event?.startsWith('watch');

const MANIFEST = 'manifest.json';
const MANIFEST_OVR = `manifest-${FLAVOR}.json`;

/** Nuking comments and whitespace between tags on separate lines as we don't rely on it.
 * The only exception we use is a same-line space e.g. <b>foo</b> <b>bar</b>  */
const RX_HTML_WS = /^\s+|(?<=[>"',.]|&nbsp;)[ \t]*[\r\n]\s*|\s+(?=>|<\/)|<!--.*?-->|\s+$/gs;
const nukeHtmlSpaces = str => str.replace(RX_HTML_WS, '');

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
  return Object.entries({
    Chrome: BUILD !== 'firefox' &&
      require(SRC + MANIFEST_OVR).minimum_chrome_version,
    Firefox: BUILD !== 'chrome' &&
      require(SRC + MANIFEST_OVR.replace('.', '-firefox.'))
        .browser_specific_settings.gecko.strict_min_version,
  }).map(([name, ver]) => ver && `${name} >= ${parseFloat(ver)}`)
    .filter(Boolean);
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
  CM_PACKAGE_PATH: path.dirname(require.resolve('codemirror/package.json')) + path.sep,
  DEV,
  FLAVOR,
  MANIFEST,
  MV3,
  ROOT,
  SRC,
  TARGET,
  ZIP,
  anyPathSep,
  escapeForRe,
  escapeToRe,
  getBrowserlist,
  nukeHtmlSpaces,
  transBabel,
  transESM2var,
  transSourceMap,
};
