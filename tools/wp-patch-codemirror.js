'use strict';

const {CM_PACKAGE_PATH} = require('./util');
const CM_PATH = require.resolve('codemirror/lib/codemirror');
const importCssData = {
  search: 'import CodeMirror',
  replace: 'import * as cssData from "@/cm/css-data";\n$&',
};
const modularizer = {
  search: /(?:^|\r?\n)\(function\(mod\) {\s+.+\s+mod\((.+)\);?(?:\r?\n.+){4}\s+}\)\(function\(CodeMirror\) {(?:\s+['"]use strict['"];?)?([\s\S]+)}\);?\s*$/,
  replace(_, reqs, body) {
    reqs = reqs.match(/(?<=require\()".+?"/g);
    reqs = reqs ? `import CodeMirror from ${reqs.shift()};\n${
      reqs.map(s => `import ${s.includes('/css/css') ? '"@/cm/css"' : s};\n`).join('')
    }` : '';
    return reqs + body;
  },
};

module.exports = [{
  test: CM_PATH,
  loader: 'string-replace-loader',
  options: {
    strict: true,
    search: /\(function \(global, factory\) {[\s\S]+\(this, \(function \(\) { 'use strict';?([\s\S]+)return CodeMirror;?\s+}\)\)\);?\s*$/,
    replace: '$1export default CodeMirror;',
  },
}, {
  test: require.resolve('codemirror/addon/hint/css-hint'),
  loader: 'string-replace-loader',
  options: {
    strict: true,
    multiple: [
      modularizer,
      importCssData,
      {search: /(?<=var pseudoClasses = ){[^}]+}/, replace: 'cssData.pseudos'},
      {search: 'for (var name in keywords)', replace: 'for (var name of keywords)'},
    ],
  },
}, {
  test: require.resolve('codemirror/mode/stylus/stylus'),
  loader: 'string-replace-loader',
  options: {
    strict: true,
    multiple: [
      modularizer,
      importCssData,
      {
        search: new RegExp(String.raw`(var (${[
          'documentTypes',
          'mediaTypes',
          'mediaFeatures',
          'propertyKeywords',
          'nonStandardPropertyKeywords',
          'fontProperties',
          'colorKeywords',
          'valueKeywords',
        ].join('|')})_ =) \[[^\]]+]`, 'g'),
        replace: '$1 cssData.$2',
      },
    ],
  },
}, {
  test: /\.js$/,
  include: [CM_PACKAGE_PATH],
  exclude: [CM_PATH],
  loader: 'string-replace-loader',
  options: {strict: true, ...modularizer},
}];
