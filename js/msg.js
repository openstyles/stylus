/* global TDM */// apply.js - used only in non-bg context
'use strict';

(() => {
  if (window.INJECTED === 1) return;

  const TARGETS = Object.assign(Object.create(null), {
    all: ['both', 'tab', 'extension'],
    extension: ['both', 'extension'],
    tab: ['both', 'tab'],
  });
  const handler = {
    both: new Set(),
    tab: new Set(),
    extension: new Set(),
  };
  const loadBg = () => browser.runtime.getBackgroundPage().catch(() => false);
  const rxIgnorableError = /Receiving end does not exist|The message port closed before/;
  const saveStack = () => new Error(); // Saving callstack prior to `await`

  const portReqs = {};
  let bgReadySignal;
  let bgReadying = new Promise(fn => (bgReadySignal = fn));
  let msgId = 0;
  /** @type {chrome.runtime.Port} */
  let port;

  // TODO: maybe move into browser.js and hook addListener to wrap/unwrap automatically
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  /* In chrome-extension:// context `window.msg` is created earlier by another script,
   * while in a content script it's not, but may exist anyway due to a DOM node with id="msg",
   * so we check chrome.tabs first to decide whether we can reuse the existing object. */
  const msg = Object.assign(chrome.tabs ? window.msg : window.msg = {}, /** @namespace msg */ {

    on(fn) {
      handler.both.add(fn);
    },

    onTab(fn) {
      handler.tab.add(fn);
    },

    onExtension(fn) {
      handler.extension.add(fn);
    },

    off(fn) {
      for (const type of TARGETS.all) {
        handler[type].delete(fn);
      }
    },

    _execute(target, ...args) {
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
    },
    _unwrap: unwrap,
    _wrapError: wrapError,
  });

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

  function apiPortDisconnect() {
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

  function onRuntimeMessage({data, target}, sender, sendResponse) {
    if (data.method === 'backgroundReady') {
      if (bgReadySignal) bgReadySignal(true);
      if (port) apiPortDisconnect();
    }
    const res = msg._execute(target, data, sender);
    if (res instanceof Promise) {
      res.then(wrapData, wrapError).then(sendResponse);
      return true;
    }
    if (res !== undefined) sendResponse(wrapData(res));
  }

  async function unwrap(promise) {
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

  function wrapError(error) {
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

  if (msg.bg === window) return;

  const apiApply = async (path, args) => {
    const {bg = msg.bg = chrome.tabs && await loadBg() || false} = msg;
    const message = {method: 'invokeAPI', path, args};
    return bg && ((bg.msg || {}).ready || await bg.bgReady.all) ? msg.invokeAPI(path, message)
      : bgReadying ? sendRetry(message)
        : apiSend(message);
  };

  const apiHandler = {
    get({path}, name) {
      const fn = () => {};
      fn.path = path ? path + '.' + name : name;
      return new Proxy(fn, apiHandler);
    },
    apply({path}, thisObj, args) {
      return apiApply(path, args);
    },
  };
  window.API = /** @type {API} */ new Proxy({path: ''}, apiHandler);
})();
