'use strict';

const {CM_PACKAGE_PATH} = require('./util');
const CM_PATH = require.resolve('codemirror/lib/codemirror');
const importCssData = {
  strict: true,
  search: 'import CodeMirror',
  replace: 'import * as cssData from "@/cm/css-data";\n$&',
};
module.exports = [{
  test: require.resolve('codemirror'),
  loader: 'string-replace-loader',
  options: {
    multiple: [{
      search: /(function startWorker[^<]+<) cm\.display\.viewTo\)/,
      replace: '$1 cm.doc.size)',
      strict: true,
    }, {
      search: /(?<top>function highlightWorker.+\s+)(?<head>[^(]+\()(?<chk>doc\.high[^5]+)500(?<neck>[\s\S]+?)(?<vis>if \(context\.line.+\s+)(?<chest>[\s\S]+?)(?<change>var ischange[\s\S]+?if \(ischange\).+\s+)(?<legs>[\s\S]+?)(?<stop>startWorker.+\s+return)(?<end>[\s\S]+?}\); })/,
      replace: '$<top>var stopped;$<head>false && $<chk>1e9$<neck>' +
        'if(1) {$<chest>$<vis>$<change>}$<legs>$<stop> stopped =$<end>\nreturn stopped;',
      strict: true,
    }, {
      search: /(function resetModeState.+\s+)(cm\.doc\.iter[\s\S]+?)(startWorker)\((cm, 100)\)/,
      replace: '$1!cm.options.value && $2setTimeout($3, 0, $4)',
      strict: true,
    }],
  },
}, {
  test: CM_PATH,
  loader: 'string-replace-loader',
  options: {
    search: /\(function \(global, factory\) {[\s\S]+\(this, \(function \(\) { 'use strict';?([\s\S]+)return CodeMirror;?\s+}\)\)\);?\s*$/,
    replace: '$1export default CodeMirror;',
    strict: true,
  },
}, {
  test: require.resolve('codemirror/addon/hint/css-hint'),
  loader: 'string-replace-loader',
  options: {
    multiple: [
      importCssData,
      {search: /(?<=var pseudoClasses = ){[^}]+}/, replace: 'cssData.pseudos', strict: true},
      {search: 'for (var name in keywords)', replace: 'for (var name of keywords)', strict: true},
    ],
  },
}, {
  test: require.resolve('codemirror/mode/stylus/stylus'),
  loader: 'string-replace-loader',
  options: {
    multiple: [
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
        strict: true,
      },
    ],
  },
}, {
  test: /\.js$/,
  include: [CM_PACKAGE_PATH],
  exclude: [CM_PATH],
  loader: 'string-replace-loader',
  options: {
    search: /(?:^|\r?\n)\(function\(mod\) {\s+.+\s+mod\((.+)\);?(?:\r?\n.+){4}\s+}\)\(function\(CodeMirror\) {(?:\s+['"]use strict['"];?)?([\s\S]+)}\);?\s*$/,
    replace(_, reqs, body) {
      reqs = reqs.match(/(?<=require\()".+?"/g);
      reqs = reqs ? `import CodeMirror from ${reqs.shift()};\n${
        reqs.map(s => `import ${s.includes('/css/css') ? '"@/cm/css"' : s};\n`).join('')
      }` : '';
      return reqs + body;
    },
    strict: true,
  },
}];
