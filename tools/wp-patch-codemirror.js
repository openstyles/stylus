'use strict';

const {CM_PACKAGE_PATH, makePatchOptions} = require('./util');
const CM_PATH = 'codemirror/lib/codemirror';
const importCssData = [
  'import CodeMirror',
  'import * as cssData from "cm5-css-mode-mod/css-data";\n$&',
];

const patchCodeMirror = makePatchOptions([
  ['codemirror',
    [/(function startWorker[^<]+<) cm\.display\.viewTo\)/,
      '$1 cm.doc.size)'],
    // eslint-disable-next-line secure-coding/no-redos-vulnerable-regex
    [/(?<top>function highlightWorker.+\s+)(?<head>[^(]+\()(?<chk>doc\.high[^5]+)500(?<neck>[\s\S]+?)(?<vis>if \(context\.line.+\s+)(?<chest>[\s\S]+?)(?<change>var ischange[\s\S]+?if \(ischange\).+\s+)(?<legs>[\s\S]+?)(?<stop>startWorker.+\s+return)(?<end>[\s\S]+?}\); })/,
      '$<top>var stopped;$<head>false && $<chk>1e9$<neck>' +
      'if(1) {$<chest>$<vis>$<change>}$<legs>$<stop> stopped =$<end>\nreturn stopped;'],
    // eslint-disable-next-line secure-coding/no-redos-vulnerable-regex
    [/(function resetModeState.+\s+)(cm\.doc\.iter[\s\S]+?)(startWorker)\((cm, 100)\)/,
      '$1!cm.options.value && $2setTimeout($3, 0, $4)'],
  ],

  [CM_PATH, [
    /\(function \(global, factory\) {[\s\S]+\(this, \(function \(\) { 'use strict';?([\s\S]+)return CodeMirror;?\s+}\)\)\);?\s*$/,
    '$1export default CodeMirror;',
  ]],

  ['codemirror/addon/hint/css-hint',
    importCssData,
    [/(?<=var pseudoClasses = ){[^}]+}/, 'cssData.pseudos'],
    ['for (var name in keywords)', 'for (var name of keywords)'],
  ],

  ['codemirror/addon/dialog/dialog',
    ['.innerHTML', '.textContent'],
  ],

  ['codemirror/addon/lint/lint',
    ["typeof ann.messageHTML != 'undefined'", '0'],
  ],

  ['codemirror/mode/stylus/stylus',
    importCssData,
    [/(var (documentTypes|mediaTypes|mediaFeatures|propertyKeywords|nonStandardPropertyKeywords|fontProperties|colorKeywords|valueKeywords)_ =) \[[^\]]+]/g,
      '$1 cssData.$2',
    ],
  ],

  [{
    test: /\.js$/,
    include: [CM_PACKAGE_PATH],
    exclude: [require.resolve(CM_PATH)],
  }, [
    /(?:^|\r?\n)\(function\(mod\) {\s+.+\s+mod\((.+)\);?(?:\r?\n.+){4}\s+}\)\(function\(CodeMirror\) {(?:\s+['"]use strict['"];?)?([\s\S]+)}\);?\s*$/,
    (_, reqs, body) => {
      reqs = reqs.match(/(?<=require\()".+?"/g);
      reqs = reqs ? `import CodeMirror from ${reqs.shift()};\n${
        reqs.map(s => `import ${s.includes('/css/css') ? '"cm5-css-mode-mod"' : s};\n`).join('')
      }` : '';
      return reqs + body;
    },
  ]],
]);

module.exports = patchCodeMirror;
