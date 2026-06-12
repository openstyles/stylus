'use strict';

const fs = require('fs');
const {makePatchOptions} = require('./util');

const LIB = 'less/lib/';
const LIB_LESS = 'less/lib/less/';
const BROWSER = LIB + 'less-browser/';
const INDEX = require.resolve(LIB_LESS + 'index.js');
const PKG = INDEX.replace(/[/\\]lib[/\\]less.+$/, '/package.json');
const {version} = JSON.parse(fs.readFileSync(PKG, 'utf8'));

module.exports = makePatchOptions([
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
  [LIB_LESS + 'import-manager.js',
    [/, pluginLoader = .+/, ''],
    [/importOptions\.isPlugin/g, '0'],
  ],
  [LIB_LESS + 'parse.js',
    [/import PluginManager.+/, ''],
    [/(?<=const pluginManager = ).+/, '{less: this};'],
    ['if (options.plugins', 'if (0'],
  ],
  [LIB_LESS + 'parse-tree.js',
    [/if \(options\.(sourceMap|pluginManager)/g, 'if (0'],
  ],
  [LIB_LESS + 'transform-tree.js',
    [/if \(options\.pluginManager/g, 'if (0'],
  ],
  [LIB_LESS + 'environment/environment.js',
    [/if \(options\.pluginManager/g, 'if (0'],
  ],
  [LIB_LESS + 'parser/parser.js',
    [/if \(context\.pluginManager/, 'if (0'],
  ],
]);
