import {COMMANDS, initRemotePort} from '../port';
import extractSections from './extract-sections';
import lintWorker from './lint-worker';
import {metaParse} from './meta-parser';
import compileUsercss from './usercss-compiler';

global.onconnect = // only present in SharedWorker
  global.onmessage = // only present in Worker used for Chrome Android, https://crbug.com/40290702
    initRemotePort.bind(COMMANDS);

/** @namespace WorkerAPI */
Object.assign(COMMANDS, {
  compileUsercss,
  extractSections,
  metaParse,
}, lintWorker);
