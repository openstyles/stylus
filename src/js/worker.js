import {initRemotePort} from './port';
import './worker-background';
import './worker-editor';
import {workerApi} from './worker-util';

self.onconnect = evt => initRemotePort(evt, workerApi, true);
