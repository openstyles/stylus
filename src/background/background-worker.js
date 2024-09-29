'use strict';

/** @namespace BackgroundWorker */
createWorkerApi({

  async compileUsercss(...args) {
    importScripts('/js/usercss-compiler'); /* global compileUsercss */
    return compileUsercss(...args);
  },

  nullifyInvalidVars(vars) {
    importScripts('/js/meta-parser'); /* global metaParser */
    return metaParser.nullifyInvalidVars(vars);
  },

  parseMozFormat(...args) {
    importScripts('/js/moz-parser'); /* global extractSections */
    return extractSections(...args);
  },

  parseUsercssMeta(text) {
    importScripts('/js/meta-parser');
    return metaParser.parse(text);
  },
});
