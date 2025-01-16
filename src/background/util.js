import {CLIENT, createPortProxy} from '@/js/port';
import {workerPath} from '@/js/urls';
import {clientDataJobs} from './common';
import offscreen from './offscreen';

/** @return {WindowClient[]} */
export const getWindowClients = () => self.clients.matchAll({
  includeUncontrolled: true,
  type: 'window',
});

const getWorkerPortFromClient = async () => {
  let proxy;
  __.DEBUGPORT('sw -> worker -> offscreen client', offscreen[CLIENT]);
  if (!offscreen[CLIENT]) {
    for (const client of await getWindowClients()) {
      if (!clientDataJobs.has(client.url)) {
        __.DEBUGPORT('sw -> worker -> client', client);
        proxy = createPortProxy(client, {once: true});
        break;
      }
    }
  }
  return (proxy || offscreen).getWorkerPort(workerPath);
};

/** @type {WorkerAPI} */
export const worker = __.MV3
  ? createPortProxy(getWorkerPortFromClient, {lock: workerPath})
  : createPortProxy(workerPath);
