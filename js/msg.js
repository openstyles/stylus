'use strict';

(() => {
  if (window.INJECTED === 1) return;

  const TARGETS = Object.assign(Object.create(null), {
    all: ['both', 'tab', 'extension'],
    extension: ['both', 'extension'],
    tab: ['both', 'tab'],
  });
  const ERR_NO_RECEIVER = 'Receiving end does not exist';
  const ERR_PORT_CLOSED = 'The message port closed before';
  const NULL_RESPONSE = {error: {message: ERR_NO_RECEIVER}};
  const STACK = 'Callstack before invoking msg.';
  const handler = {
    both: new Set(),
    tab: new Set(),
    extension: new Set(),
  };
  const loadBg = () => browser.runtime.getBackgroundPage().catch(() => false);
  let bgReadySignal;
  let bgReadying = new Promise(fn => (bgReadySignal = fn));

  // TODO: maybe move into browser.js and hook addListener to wrap/unwrap automatically
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  /* In chrome-extension:// context `window.msg` is created earlier by another script,
   * while in a content script it's not, but may exist anyway due to a DOM node with id="msg",
   * so we check chrome.tabs first to decide whether we can reuse the existing object. */
  const msg = Object.assign(chrome.tabs ? window.msg : window.msg = {}, {

    isIgnorableError(err) {
      const text = `${err && err.message || err}`;
      return text.includes(ERR_NO_RECEIVER) || text.includes(ERR_PORT_CLOSED);
    },

    ignoreError(err) {
      if (!msg.isIgnorableError(err)) {
        console.warn(err);
      }
    },

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

    async send(data, target = 'extension') {
      const err = new Error(`${STACK}send:`); // Saving callstack prior to `await`
      return unwrap(err, await browser.runtime.sendMessage({data, target}));
    },

    async sendTab(tabId, data, options, target = 'tab') {
      const err = new Error(`${STACK}sendTab:`); // Saving callstack prior to `await`
      return unwrap(err, await browser.tabs.sendMessage(tabId, {data, target}, options));
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
  });

  function onRuntimeMessage({data, target}, sender, sendResponse) {
    if (bgReadying && data && data.method === 'backgroundReady') {
      bgReadySignal();
    }
    const res = msg._execute(target, data, sender);
    if (res instanceof Promise) {
      res.then(wrapData, wrapError).then(sendResponse);
      return true;
    }
    if (res !== undefined) sendResponse(wrapData(res));
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

  function unwrap(localErr, {data, error} = NULL_RESPONSE) {
    return error
      ? Promise.reject(Object.assign(localErr, error, error.stack && {
        stack: `${error.stack}\n${localErr.stack}`,
      }))
      : data;
  }

  async function sendRetry(m) {
    try {
      return await msg.send(m);
    } catch (e) {
      if (!bgReadying || !msg.isIgnorableError(e)) {
        return Promise.reject(e);
      }
      await bgReadying;
      return msg.send(m);
    } finally {
      // Assuming bg is ready if messaging succeeded
      bgReadying = bgReadySignal = null;
    }
  }

  if (msg.bg === window) return;

  const apiHandler = {
    get({path}, name) {
      const fn = () => {};
      fn.path = [...path, name];
      return new Proxy(fn, apiHandler);
    },
    async apply({path}, thisObj, args) {
      const {bg = msg.bg = chrome.tabs && await loadBg() || false} = msg;
      const message = {method: 'invokeAPI', path, args};
      return bg && ((bg.msg || {}).ready || await bg.bgReady.all) ? msg.invokeAPI(path, message)
        : bgReadying ? sendRetry(message)
          : msg.send(message);
    },
  };
  window.API = /** @type {API} */ new Proxy({path: []}, apiHandler);
})();
