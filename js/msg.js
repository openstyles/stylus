/* global promisifyChrome */
/* global deepCopy getOwnTab URLS */ // not used in content scripts
'use strict';

// eslint-disable-next-line no-unused-expressions, no-var
var msg = window.INJECTED === 1 && window.msg || (() => {
  promisifyChrome({
    runtime: ['sendMessage', 'getBackgroundPage'],
    tabs: ['sendMessage', 'query'],
  });
  const TARGETS = Object.assign(Object.create(null), {
    all: ['both', 'tab', 'extension'],
    extension: ['both', 'extension'],
    tab: ['both', 'tab'],
  });
  const NEEDS_TAB_IN_SENDER = [
    'getTabUrlPrefix',
    'updateIconBadge',
    'styleViaAPI',
  ];
  const ERR_NO_RECEIVER = 'Receiving end does not exist';
  const ERR_PORT_CLOSED = 'The message port closed before';
  const handler = {
    both: new Set(),
    tab: new Set(),
    extension: new Set(),
  };

  let bg = chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage();
  const isBg = bg === window;
  if (!isBg && (!bg || !bg.document || bg.document.readyState === 'loading')) {
    bg = null;
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  window.API = new Proxy({}, {
    get(target, name) {
      // using a named function for convenience when debugging
      return async function invokeAPI(...args) {
        if (!bg && chrome.tabs) {
          bg = await browser.runtime.getBackgroundPage().catch(() => {});
        }
        const message = {method: 'invokeAPI', name, args};
        // content scripts, frames and probably private tabs
        if (!bg || window !== parent) {
          return msg.send(message);
        }
        // in FF, the object would become a dead object when the window
        // is closed, so we have to clone the object into background.
        const res = bg.msg._execute(TARGETS.extension, bg.deepCopy(message), {
          frameId: 0,
          tab: NEEDS_TAB_IN_SENDER.includes(name) && await getOwnTab(),
          url: location.href,
        });
        return deepCopy(await res);
      };
    },
  });

  return {
    isBg,

    async broadcast(data) {
      const requests = [msg.send(data, 'both').catch(msg.ignoreError)];
      for (const tab of await browser.tabs.query({})) {
        const url = tab.pendingUrl || tab.url;
        if (!tab.discarded &&
            !url.startsWith(URLS.ownOrigin) &&
            URLS.supported(url)) {
          requests[tab.active ? 'unshift' : 'push'](
            msg.sendTab(tab.id, data, null, 'both').catch(msg.ignoreError));
        }
      }
      return Promise.all(requests);
    },

    broadcastExtension(...args) {
      return msg.send(...args).catch(msg.ignoreError);
    },

    isIgnorableError(err) {
      const msg = `${err && err.message || err}`;
      return msg.includes(ERR_NO_RECEIVER) || msg.includes(ERR_PORT_CLOSED);
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

    send(data, target = 'extension') {
      return browser.runtime.sendMessage({data, target})
        .then(unwrapResponse);
    },

    sendTab(tabId, data, options, target = 'tab') {
      return browser.tabs.sendMessage(tabId, {data, target}, options)
        .then(unwrapResponse);
    },

    _execute(types, ...args) {
      let result;
      for (const type of types) {
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
  };

  // TODO: maybe move into polyfill.js and hook addListener + sendMessage so they wrap/unwrap automatically
  function handleMessage({data, target}, sender, sendResponse) {
    const res = msg._execute(TARGETS[target] || TARGETS.all, data, sender);
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

  function unwrapResponse({data, error} = {error: {message: ERR_NO_RECEIVER}}) {
    return error
      ? Promise.reject(Object.assign(new Error(error.message), error))
      : data;
  }
})();
