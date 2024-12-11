import {COMMANDS, initRemotePort} from './port';
import './worker-background';
import './worker-editor';

global.onconnect = // only present in SharedWorker
  global.onmessage = // only present in Worker used for Chrome Android, https://crbug.com/40290702
    initRemotePort.bind(COMMANDS);
