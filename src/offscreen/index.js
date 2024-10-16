/** @type {MessagePort} */
let bgPort;
/** @type {{[url: string]: Worker}} */
const workers = {};
/** @namespace Offscreen */
const COMMANDS = {
  __proto__: null,
  /** Note that `onchange` doesn't work in bg context, so we use it in the content script */
  isDark: () => matchMedia('(prefers-color-scheme:dark)').matches,
  /** @this {MessageEvent} */
  worker(url) {
    (workers[url] || (workers[url] = new Worker('/js/worker-util.js?url=' + url)))
      .postMessage(null, [this.ports[0]]);
  },
};

/** @param {MessageEvent} evt */
navigator.serviceWorker.onmessage = evt => {
  bgPort = evt.ports[0];
  bgPort.postMessage({id: 0});
  bgPort.onmessage = bgPortOnMessage;
  chrome.runtime.connect({name: evt.data[1]});
};
navigator.serviceWorker.startMessages();

/** @param {MessageEvent} evt */
async function bgPortOnMessage(evt) {
  const {args: [cmd, args], id} = evt.data;
  let res, err;
  try {
    res = COMMANDS[cmd].apply(evt, args);
    if (res instanceof Promise) res = await res;
  } catch (e) {
    err = e;
  }
  bgPort.postMessage({id, res, err});
}
