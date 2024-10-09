import {createWorkerApi, importScripts} from '/js/worker-util';

/** @namespace BackgroundWorker */
createWorkerApi({

  async compileUsercss(...args) {
    importScripts('usercss-compiler.js'); /* global compileUsercss */
    return compileUsercss(...args);
  },

  nullifyInvalidVars(vars) {
    importScripts('meta-parser.js'); /* global metaParser */
    return metaParser.nullifyInvalidVars(vars);
  },

  parseMozFormat(...args) {
    importScripts('moz-parser.js', 'parserlib.js'); /* global extractSections */
    return extractSections(...args);
  },

  parseUsercssMeta(text) {
    importScripts('meta-parser.js');
    return metaParser.parse(text);
  },
});
