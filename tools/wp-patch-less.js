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
  [LIB_LESS + 'less-error.js',
    ['if (!this.line', 'if (0'],
    ['if (typeof Object.create', 'if (0'],
    ['LessError.prototype.toString = ', '0&&'],
  ],
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
    ['const toCSSOptions = {', '$& docs: options.docs = [],'],
  ],
  [LIB_LESS + 'render.js',
    ['callback(null, result', '$&, options.docs'],
  ],
  [LIB_LESS + 'transform-tree.js',
    [/if \(options\.pluginManager/g, 'if (0'],
  ],
  [LIB_LESS + 'functions/string.js',
    [/import JavaScript.+/, ''],
    ['str instanceof JavaScript ? str.evaluated : ', ''],
  ],
  [LIB_LESS + 'tree/atrule.js',
    [/\) \{\s+super\(\);/,
      ',cmt $& this.cmt = cmt;'],
    ['visibilityInfo())))',
      'visibilityInfo(), this.cmt)))'],
    [/(?<=\n\s+genCSS\(.+\{)([\s\S]+?if \(rules\) \{\s+)(.+;)/, `\
      let _start = this.cmt != null ? output.add().length : -1;
      let _body, _str;
      $1
      if (_start >= 0) {
        context.tabLevel = -1;
        _body = output.add().length + !context.compress * 3; // skipping "{" or " {\\n"
      }
      $2
      if (_body) {
        _str = output.add();
        context.docs.push([
          this.cmt,
          value,
          _str.slice(_body, -1).trim(),
          _start,
          _str.length,
        ]);
        context.tabLevel = 0;
      }`],
  ],
  [LIB_LESS + 'tree/index.js',
    [/import JavaScript.+/, ''],
    [', JavaScript', ''],
  ],
  [LIB_LESS + 'tree/node.js',
    [/toCSS\(context.+[\s\S]+strs\.join.+\s+}/, `${{
      toCSS(context) {
        let str = '';
        this.genCSS(context, {
          add: chunk => chunk ? (str += chunk) : str,
          isEmpty: () => !str,
        });
        return str;
      }}.toCSS}`],
  ],
  [LIB_LESS + 'environment/environment.js',
    [/if \(options\.pluginManager/g, 'if (0'],
  ],
  [LIB_LESS + 'parser/parser.js',
    [/if \(context\.pluginManager/,
      'if (0'],
    [/while .+\s+node = this\.comment.+\s+if \(!node.+/,
      'let cmt1; $& cmt1 = node._index;'],
    ['|| this.atrule(',
      '$&cmt1, cmt1 >= 0 && parserInput.i'],
    ['atrule: function (',
      '$&cmt1, cmt2, cmt'],
    ["case '@document':",
      '$& cmt = cmt2 ? parserInput.getInput().slice(cmt1, cmt2).trim() : "";'],
    [/new\(tree\.AtRule\).+\s+.+\s+isRooted/,
      '$&, null, cmt'],
    ['entities.javascript()',
      'undefined'],
    [/javascript: function [\s\S]+?invalid javascript.+\s+}/,
      ''],
  ],
]);
