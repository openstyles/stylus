/* global createWorkerApi */// worker-util.js
'use strict';

/** @namespace BackgroundWorker */
createWorkerApi({

  async compileUsercss(...args) {
    require(['/js/usercss-compiler']); /* global compileUsercss */
    return compileUsercss(...args);
  },

  nullifyInvalidVars(vars) {
    require(['/js/meta-parser']); /* global metaParser */
    return metaParser.nullifyInvalidVars(vars);
  },

  parseMozFormat(...args) {
    require(['/js/moz-parser']); /* global extractSections */
    return extractSections(...args);
  },

  parseUsercssMeta(text) {
    require(['/js/meta-parser']);
    return metaParser.parse(text);
  },
});
