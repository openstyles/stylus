import {COMMANDS, initRemotePort} from '../port';
import {metaParse, nullifyInvalidVars} from './meta-parser';
import extractSections from './moz-parser';
import compileUsercss from './usercss-compiler';
import lintWorker from './lint-worker';

global.onconnect = // only present in SharedWorker
  global.onmessage = // only present in Worker used for Chrome Android, https://crbug.com/40290702
    initRemotePort.bind(COMMANDS);

/** @namespace WorkerAPI */
Object.assign(COMMANDS, {
  compileUsercss,
  extractSections,
  nullifyInvalidVars,
  metaParse,
}, lintWorker);
