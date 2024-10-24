'use strict';

const webpack = require('webpack');
const RG = webpack.RuntimeGlobals;

class GlobalThis extends webpack.RuntimeModule {
  constructor() {
    super('global');
  }
  generate() { // eslint-disable-line class-methods-use-this
    return `${RG.global} = global;`;
  }
}

class WebpackPatchBootstrapPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(this.constructor.name, compilation => {
      for (const [target, str, impl] of [
        [RG.global, 'GlobalRuntimeModule', GlobalThis],
      ]) {
        compilation.hooks.runtimeRequirementInTree.for(target).intercept({
          register(tap) {
            if (`${tap.fn}`.includes(str)) {
              tap.fn = chunk => {
                compilation.addRuntimeModule(chunk, new impl());
                return true;
              };
            }
            return tap;
          },
        });
      }
    });
  }
}

module.exports = WebpackPatchBootstrapPlugin;
