import {API} from '@/js/msg-api';
import {COMMANDS} from '@/js/port';
import {fetchWebDAV, isCssDarkScheme, mapObj} from '@/js/util';

let webdavInstance;

/** @namespace OffscreenAPI */
Object.assign(COMMANDS, {
  isDark: isCssDarkScheme,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
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
