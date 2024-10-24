export const rxIgnorableError = /Receiving end does not exist|The message port closed|moved into back\/forward cache/;
export const saveStack = () => new Error(); // Saving callstack prior to `await`
const portReqs = {};

export const apiHandler = !process.env.IS_BG && {
  get: ({name: path}, name) => new Proxy(
    Object.defineProperty(() => {}, 'name', {value: path ? path + '.' + name : name}),
    apiHandler),
  apply: apiSendProxy,
};
/** @typedef {{}} API */
/** @type {API} */
export const API = process.env.IS_BG
  ? process.env.API
  : process.env.API = new Proxy({path: ''}, apiHandler);

export let bgReadySignal;
let bgReadying = !process.env.MV3 && new Promise(fn => (bgReadySignal = fn));
let msgId = 0;
/** @type {chrome.runtime.Port} */
export let port;

async function apiSend(data) {
  const id = ++msgId;
  const err = saveStack();
  if (!port) {
    port = chrome.runtime.connect({name: 'api'});
    port.onMessage.addListener(apiPortResponse);
    port.onDisconnect.addListener(apiPortDisconnect);
  }
  port.postMessage({id, data, TDM: self.TDM});
  return new Promise((ok, ko) => (portReqs[id] = {ok, ko, err}));
}

export function apiSendProxy({name: path}, thisObj, args) {
  return (!process.env.MV3 && bgReadying ? sendRetry : apiSend)({method: 'invokeAPI', path, args});
}

export function apiPortDisconnect() {
  const error = chrome.runtime.lastError;
  if (error) for (const id in portReqs) apiPortResponse({id, error});
  port = null;
}

function apiPortResponse({id, data, error}) {
  const req = portReqs[id];
  delete portReqs[id];
  if (error) {
    const {err} = req;
    err.message = error.message;
    if (error.stack) err.stack = error.stack + '\n' + err.stack;
    req.ko(error);
  } else {
    req.ok(data);
  }
}

async function sendRetry(m) {
  try {
    return await apiSend(m);
  } catch (e) {
    return bgReadying && rxIgnorableError.test(e.message)
      ? await bgReadying && apiSend(m)
      : Promise.reject(e);
  } finally {
    // Assuming bg is ready if messaging succeeded
    bgReadying = bgReadySignal = null;
  }
}
