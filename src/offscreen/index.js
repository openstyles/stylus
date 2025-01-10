import {API} from '@/js/msg-api';
import {COMMANDS} from '@/js/port';
import {fetchWebDAV, isCssDarkScheme, mapObj} from '@/js/util';

let dbCache;
let webdavInstance;

/** @namespace OffscreenAPI */
Object.assign(COMMANDS, {
  isDark: isCssDarkScheme,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
  dbCache(dbName, cmd, a, b, dataKey) {
    if (typeof dbName === 'object' /* includes `null` */) {
      dbCache = dbName;
      return;
    }
    const map = (dbCache ??= {})[dbName] ??= new Map();
    if (cmd === 'put' || cmd === 'res:get')
      map.set(b, a);
    else if (cmd === 'delete' || cmd === 'clear')
      map[cmd](a);
    else if (cmd === 'deleteMany')
      a.forEach(map.delete, map);
    else if (cmd === 'putMany' || cmd === 'res:getAll')
      for (b of a) map.set(b[dataKey], b);
    else if (cmd === 'res:getMany')
      for (let i = 0; i < a.length; i++)
        map.set(b[i], a[i]);
    else return cmd === 'get' ? map.get(a)
      : cmd === 'getAll' ? [...map.values()]
        : cmd === 'getMany' ? a.map(map.get, map)
          : undefined;
  },
  getData: () => dbCache,
  webdav: (cmd, ...args) => webdavInstance[cmd](...args),
  webdavInit: async cfg => {
    if (!webdavInstance) await loadScript(__.JS + 'webdav.js');
    cfg.fetch = fetchWebDAV.bind(cfg);
    cfg.getAccessToken = () => API.sync.getToken('webdav');
    webdavInstance = global.webdav(cfg);
    return mapObj(webdavInstance, v => typeof v === 'function' ? null : v);
  },
});

/** A loader for scripts exposing a global, 100x smaller than webpack's smart chunk loader */
function loadScript(url) {
  return new Promise((resolve, reject) => document.head.appendChild(Object.assign(
    $tag('script'), {
      src: url,
      onload: resolve,
      onerror: reject,
    })));
}
