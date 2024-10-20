import {initRemotePort} from '/js/port';
import {isCssDarkScheme} from '/js/util-base';

/** @namespace OffscreenAPI */
const COMMANDS = {
  __proto__: null,
  /** Note that `onchange` doesn't work in bg context, so we use it in the content script */
  isDark: isCssDarkScheme,
  /** @this {RemotePortEvent} */
  getWorkerPort(url) {
    const port = new SharedWorker(url).port;
    this._transfer = [port];
    return port;
  },
};

/** @param {MessageEvent} evt */
navigator.serviceWorker.onmessage = evt => initRemotePort(evt, COMMANDS, true);
