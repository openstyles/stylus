import {COMMANDS} from '/js/port';
import {importScriptsOnce} from './worker-util';

/** @namespace BackgroundWorker */
Object.assign(COMMANDS, {
  /* global compileUsercss */
  compileUsercss: [() => compileUsercss, 'usercss-compiler.js'],
  /* global metaParser */
  nullifyInvalidVars: [() => metaParser.nullifyInvalidVars, 'meta-parser.js'],
  /* global extractSections */
  parseMozFormat: [() => extractSections, 'moz-parser.js', 'parserlib.js'],
  parseUsercssMeta: [() => metaParser.parse, 'meta-parser.js'],
});

for (const k in COMMANDS) {
  if (Array.isArray(COMMANDS[k])) {
    const [getFunc, ...files] = COMMANDS[k];
    COMMANDS[k] = function () {
      importScriptsOnce(...files);
      return (COMMANDS[k] = getFunc()).apply(this, arguments);
    };
  }
}
