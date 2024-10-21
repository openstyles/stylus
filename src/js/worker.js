import {COMMANDS, initRemotePort} from './port';
import './worker-background';
import './worker-editor';

self.onconnect = initRemotePort.bind(COMMANDS);
