'use strict';

const fs = require('fs');
const path = require('path');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const MANIFEST = 'manifest.json';
const MANIFEST_MV3 = 'manifest-mv3.json';
const ROOT = path.dirname(__dirname.replaceAll('\\', '/')) + '/';
const SRC = ROOT + 'src/';

/** Dumb regexp replacement for `process.env.XXX` vars via string-replace-loader */
class RawEnvPlugin {
  static loader = 'string-replace-loader';
  search = /\bprocess\.env\.(\w+)\b/g;
  constructor(vars, raws = {}) {
    const map = this.map || (this.map = {});
    for (const k in vars) map[k] = JSON.stringify(vars[k]);
    for (const k in raws) map[k] = raws[k];
  }
  apply(compiler) {
    const LOADER = RawEnvPlugin.loader;
    compiler.hooks.initialize.tap(this.constructor.name, () => {
      for (const {use} of compiler.options.module.rules) {
        let i, obj;
        if (!use ||
            (i = use.indexOf(LOADER)) < 0 &&
            !(obj = use.find(u => u.loader === LOADER))) continue;
        obj ??= use[i] = {
          loader: LOADER,
          options: {
            search: this.search,
            replace: function replace(str, name) {
              return replace._map[name] ?? str;
            },
          },
        };
        Object.assign(obj.options.replace._map ??= {}, this.map);
        return;
      }
    });
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

function anyPathSep(str) {
  return str.replace(/[\\/]/g, /[\\/]/.source);
}

function escapeRe(str) {
  return str.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
}

function getBrowserlist() {
  const mj = require(SRC + (process.env.NODE_ENV?.includes('mv3') ? MANIFEST_MV3 : MANIFEST));
  const FF = mj.browser_specific_settings?.gecko.strict_min_version;
  const CH = mj.minimum_chrome_version;
  return [
    FF && 'Firefox >= ' + FF,
    CH && 'Chrome >= ' + CH,
  ].filter(Boolean);
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
  MANIFEST_MV3,
  ROOT,
  SRC,
  RawEnvPlugin,
  addReport,
  anyPathSep,
  escapeRe,
  getBrowserlist,
  stripSourceMap,
};
