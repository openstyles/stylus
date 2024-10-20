import {importScriptsOnce, workerApi} from './worker-util';

/** @namespace BackgroundWorker */
Object.assign(workerApi, {
  /* global compileUsercss */
  compileUsercss: [() => compileUsercss, 'usercss-compiler.js'],
  /* global metaParser */
  nullifyInvalidVars: [() => metaParser.nullifyInvalidVars, 'meta-parser.js'],
  /* global extractSections */
  parseMozFormat: [() => extractSections, 'moz-parser.js', 'parserlib.js'],
  parseUsercssMeta: [() => metaParser.parse, 'meta-parser.js'],
});

for (const k in workerApi) {
  if (Array.isArray(workerApi[k])) {
    const [getFunc, ...files] = workerApi[k];
    workerApi[k] = function () {
      importScriptsOnce(...files);
      return (workerApi[k] = getFunc()).apply(this, arguments);
    };
  }
}
