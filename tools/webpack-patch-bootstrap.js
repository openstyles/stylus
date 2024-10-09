'use strict';

const webpack = require('webpack');

const INDENT = '/******/ ';
const START = INDENT + '(() => { // webpackBootstrap';
const END = INDENT + '})()\n';
const START_TO = INDENT + '(global => {';
const END_TO = INDENT + '})(this)\n';

class GlobalThis extends webpack.RuntimeModule {
  constructor() {
    super('global');
  }
  generate() { // eslint-disable-line class-methods-use-this
    return `${webpack.RuntimeGlobals.global} = global;`;
  }
}

class WebpackPatchBootstrapPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(this.constructor.name, compilation => {
      compilation.hooks.runtimeRequirementInTree
        .for(webpack.RuntimeGlobals.global)
        .intercept({
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
      webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(compilation)
        .renderMain.intercept({
          call({_children}, target) {
            let v = _children[0];
            let t = typeof v === 'string';
            if ((t ? v : v._value)?.startsWith(START)) {
              if (t) _children[0] = START_TO;
              else v._value = v._valueAsString = START_TO;
              v = _children.at(-1);
              t = typeof v === 'string';
              if ((t ? v : v._value) !== END) {
                console.error(v = `Expected "${END}" at the end`, target.chunk.name);
                throw new Error(v);
              }
              if (t) _children[_children.length - 1] = END_TO;
              else v._value = v._valueAsString = END_TO;
            }
          },
        });
    });
  }
}

module.exports = WebpackPatchBootstrapPlugin;
