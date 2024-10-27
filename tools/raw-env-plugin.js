'use strict';

const webpack = require('webpack');
const ReplaceSource = require('webpack-sources/lib/ReplaceSource');

const re = /\bprocess\.env\.([$_A-Z][$_A-Z\d]*)\b/g;
const STAGE = webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY;

/** Dumb regexp replacement for `process.env.XXX` vars via String.replace() */
module.exports = class RawEnvPlugin {

  constructor(vars, raws = {}) {
    this.vars = vars;
    this.raws = raws;
  }

  apply(compiler) {
    const NAME = this.constructor.name;
    compiler.hooks.compilation.tap(NAME, compilation => {
      const actor = compilation.options.plugins.find(p => p instanceof this.constructor);
      const map = actor.map ??= {};
      for (const [k, v] of Object.entries(this.vars)) map[k] = JSON.stringify(v);
      for (const [k, v] of Object.entries(this.raws)) map[k] = v;
      if (this !== actor) return;
      compilation.hooks.processAssets.tap({name: NAME, stage: STAGE}, assets => {
        for (const assetName in assets) {
          if (!assetName.endsWith('.js')) continue;
          const assetSource = assets[assetName];
          const str = assetSource.source();
          let replacer;
          for (let m, val; (m = re.exec(str));) {
            if ((val = map[m[1]]) != null) {
              replacer ??= new ReplaceSource(assetSource);
              replacer.replace(m.index, m.index + m[0].length - 1, val);
            }
          }
          if (replacer) compilation.updateAsset(assetName, replacer);
        }
      });
    });
  }
};
