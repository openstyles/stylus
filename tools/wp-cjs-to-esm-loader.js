'use strict';

module.exports = function (text) {
  text = text.replace('const base64 = require("universal-base64")',
    'import * as base64 from "universal-base64"');
  text = text.replace(/\bmodule\.exports\s*=\s*(({[^{}]+})|\w+)(;?\s*)$/,
    (s, val, multi, tail) => `export ${multi || `default ${val}`}${tail}`);
  text = text.replace(/\bconst\s*({[^}]+}|\w+)\s*=\s*require\(([^)]+?)\)/g,
    (s, what, from) => `import ${what.replaceAll(':', ' as ')} from ${from}`);
  return text;
};
