'use strict';

const webpack = require('webpack');
const getGlobal = () => webpack.RuntimeGlobals.global;

class GlobalThis extends webpack.RuntimeModule {
  constructor() {
    super('global');
  }
  generate() { // eslint-disable-line class-methods-use-this
    return `${getGlobal()} = global;`;
  }
}

class WebpackPatchBootstrapPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(this.constructor.name, compilation => {
      compilation.hooks.runtimeRequirementInTree.for(getGlobal()).intercept({
        register(tap) {
          if (`${tap.fn}`.includes('GlobalRuntimeModule')) {
            tap.fn = chunk => {
              compilation.addRuntimeModule(chunk, new GlobalThis());
              return true;
            };
          }
          return tap;
        },
      });
    });
  }
}

module.exports = WebpackPatchBootstrapPlugin;
