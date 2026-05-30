'use strict';

module.exports = function (text) {
  text = text.replace('const base64 = require("universal-base64")',
    'import * as base64 from "universal-base64"');
  text = text.replace(/\bmodule\.exports\s*=\s*(({[^{}]+})|\w+)(;?\s*)$/,
    (s, val, multi, tail) => `export ${multi || `default ${val}`}${tail}`);
  text = text.replace(/\bconst\s*({[^}]+}|\w+)\s*=\s*require\(([^)]+?)\)/g,
    (s, what, from) => `import ${what.replaceAll(':', ' as ')} from ${from}`);
  const t2 = text.replace(/Object\.defineProperty\(exports,\s*["']__esModule["'],\s*{[^}]+}\);?/, '');
  if (t2 !== text) {
    text = t2.replace(/^var \w+ = \(function .+ {|(\s+return exports;\s*)?}\(\{}\)\);\s*(\/\/.*\s*)?$/g, '');
    text = text.replace(/^\s*(export)s\.(\w+) = (\w+)/gm, '$1 {$3 as $2}');
  }
  return text;
};
