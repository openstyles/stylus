'use strict';

const fs = require('fs');
const {makePatchOptions} = require('./util');

const LIB = 'less/lib/';
const BROWSER = LIB + 'less-browser/';
const INDEX = require.resolve(LIB + 'less/index.js');
const PKG = INDEX.replace(/[/\\]lib[/\\]less.+$/, '/package.json');
const {version} = JSON.parse(fs.readFileSync(PKG, 'utf8'));

module.exports = [
  [INDEX,
    [/import parseVersion.+/, ''],
    [/const v = parseVersion.+/, ''],
    [/(?<=version: \[).+?(?=],)/, version.replaceAll('.', ',')],
    [/import AbstractPluginLoader.+|AbstractPluginLoader,/g, ''],
    [/import PluginManager.+|PluginManager,/g, ''],
    [/import SourceMapOutput.+|sourceMapOutput = .+/g, ''],
    [/import sourceMapBuilder.+|sourceMapBuilder = .+/g, ''],
  ],
  [BROWSER + 'index.js',
    [/import browser .+/, ''],
    [/import PluginLoader .+|less.PluginLoader = .+/g, ''],
    [/const document = .+/, ''],
    [/const typePattern = [\s\S]+(?=return less;)/, ''],
  ],
  [BROWSER + 'bootstrap.js',
    [/addDefaultOptions\(.+/, ''],
    [/if \(options\.onReady\) {[\s\S]+\n}\s*$/, ''],
  ],
  [BROWSER + 'error-reporting.js', [
    /\badd: error,\s+remove: removeError\b/,
    'add: errorConsole, remove: removeErrorConsole',
  ]],
  [LIB + 'less/parse.js',
    [/import PluginManager.+/, ''],
    [/const pluginManager = .+\s+options.pluginManager = .+/, ''],
    ['if (options.plugins', 'if (0'],
  ],
  [LIB + 'less/parse-tree.js',
    [/if \(options\.sourceMap/, 'if (0'],
  ],
].map(v => makePatchOptions(...v));
