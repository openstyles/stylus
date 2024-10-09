/* global TDM */// apply.js - used only in non-bg context

export const isBg = process.env.PAGE && location.pathname === `/${process.env.PAGE_BG}.html`;
const TARGETS = {
  __proto: null,
  all: ['both', 'tab', 'extension'],
  extension: ['both', 'extension'],
  tab: ['both', 'tab'],
};
const handler = {
  both: new Set(),
  tab: new Set(),
  extension: new Set(),
};
const rxIgnorableError = /Receiving end does not exist|The message port closed|moved into back\/forward cache/;
const saveStack = () => new Error(); // Saving callstack prior to `await`
const portReqs = {};

export const apiHandler = !isBg && {
  get: ({name: path}, name) => new Proxy(
    Object.defineProperty(() => {}, 'name', {value: path ? path + '.' + name : name}),
    apiHandler),
  apply: apiSendProxy,
};
export const API = isBg
  ? window.API
  : window.API = new Proxy({path: ''}, apiHandler);

let bgReadySignal;
let bgReadying = new Promise(fn => (bgReadySignal = fn));
let msgId = 0;
/** @type {chrome.runtime.Port} */
let port;

// TODO: maybe move into browser.js and hook addListener to wrap/unwrap automatically
chrome.runtime.onMessage.addListener(onRuntimeMessage);

export function onMessage(fn) {
  handler.both.add(fn);
}

export function onTab(fn) {
  handler.tab.add(fn);
}

export function onExtension(fn) {
  handler.extension.add(fn);
}

export function off(fn) {
  for (const type of TARGETS.all) {
    handler[type].delete(fn);
  }
}

export function _execute(target, ...args) {
  let result;
  for (const type of TARGETS[target] || TARGETS.all) {
    for (const fn of handler[type]) {
      let res;
      try {
        res = fn(...args);
      } catch (err) {
        res = Promise.reject(err);
      }
      if (res !== undefined && result === undefined) {
        result = res;
      }
    }
  }
  return result;
}

async function apiSend(data) {
  const id = ++msgId;
  const err = saveStack();
  if (!port) {
    port = chrome.runtime.connect({name: 'api'});
    port.onMessage.addListener(apiPortResponse);
    port.onDisconnect.addListener(apiPortDisconnect);
  }
  port.postMessage({id, data, TDM});
  return new Promise((ok, ko) => (portReqs[id] = {ok, ko, err}));
}

export function apiSendProxy({name: path}, thisObj, args) {
  return (bgReadying ? sendRetry : apiSend)({method: 'invokeAPI', path, args});
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

export function onRuntimeMessage({data, target}, sender, sendResponse) {
  if (data.method === 'backgroundReady') {
    if (bgReadySignal) bgReadySignal(true);
    if (port) apiPortDisconnect();
  }
  const res = _execute(target, data, sender);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}

export async function unwrap(promise) {
  const err = saveStack();
  let data, error;
  try {
    ({data, error} = await promise || {});
  } catch (e) {
    error = e;
  }
  if (!error || rxIgnorableError.test(err.message = error.message)) {
    return data;
  }
  if (error.stack) err.stack = error.stack + '\n' + err.stack;
  return Promise.reject(err);
}

function wrapData(data) {
  return {data};
}

export function wrapError(error) {
  return {
    error: Object.assign({
      message: error.message || `${error}`,
      stack: error.stack,
    }, error), // passing custom properties e.g. `error.index`
  };
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
