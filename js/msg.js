/* global promisify deepCopy */
// deepCopy is only used if the script is executed in extension pages.
'use strict';

self.msg = self.INJECTED === 1 ? self.msg : (() => {
  const runtimeSend = promisify(chrome.runtime.sendMessage.bind(chrome.runtime));
  const tabSend = chrome.tabs && promisify(chrome.tabs.sendMessage.bind(chrome.tabs));
  const tabQuery = chrome.tabs && promisify(chrome.tabs.query.bind(chrome.tabs));

  const isBg = chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage() === window;
  if (isBg) {
    window._msg = {
      handler: null,
      clone: deepCopy
    };
  }
  const bgReady = getBg();
  const EXTENSION_URL = chrome.runtime.getURL('');
  let handler;
  const RX_NO_RECEIVER = /Receiving end does not exist/;
  // typo in Chrome 49
  const RX_PORT_CLOSED = /The message port closed before a res?ponse was received/;
  return {
    send,
    sendTab,
    sendBg,
    broadcast,
    broadcastTab,
    broadcastExtension,
    ignoreError,
    on,
    onTab,
    onExtension,
    off,
    RX_NO_RECEIVER,
    RX_PORT_CLOSED
  };

  function getBg() {
    if (isBg) {
      return Promise.resolve(window);
    }
    // try using extension.getBackgroundPage because runtime.getBackgroundPage is too slow
    // https://github.com/openstyles/stylus/issues/771
    if (chrome.extension.getBackgroundPage) {
      const bg = chrome.extension.getBackgroundPage();
      if (bg && bg.document && bg.document.readyState !== 'loading') {
        return Promise.resolve(bg);
      }
    }
    if (chrome.runtime.getBackgroundPage) {
      return promisify(chrome.runtime.getBackgroundPage.bind(chrome.runtime))()
        .catch(() => null);
    }
    return Promise.resolve(null);
  }

  function send(data, target = 'extension') {
    const message = {data, target};
    return runtimeSend(message).then(unwrapData);
  }

  function sendTab(tabId, data, options, target = 'tab') {
    return tabSend(tabId, {data, target}, options)
      .then(unwrapData);
  }

  function sendBg(data) {
    return bgReady.then(bg => {
      if (bg) {
        if (!bg._msg.handler) {
          throw new Error('there is no bg handler');
        }
        const handlers = bg._msg.handler.extension.concat(bg._msg.handler.both);
        // in FF, the object would become a dead object when the window
        // is closed, so we have to clone the object into background.
        return Promise.resolve(executeCallbacks(handlers, bg._msg.clone(data), {url: location.href}))
          .then(deepCopy);
      }
      return send(data);
    });
  }

  function ignoreError(err) {
    if (err.message && (
      RX_NO_RECEIVER.test(err.message) ||
      RX_PORT_CLOSED.test(err.message)
    )) {
      return;
    }
    console.warn(err);
  }

  function broadcast(data, filter) {
    return Promise.all([
      send(data, 'both').catch(ignoreError),
      broadcastTab(data, filter, null, true, 'both')
    ]);
  }

  function broadcastTab(data, filter, options, ignoreExtension = false, target = 'tab') {
    return tabQuery({})
      // TODO: send to activated tabs first?
      .then(tabs => {
        const requests = [];
        for (const tab of tabs) {
          const isExtension = tab.url.startsWith(EXTENSION_URL);
          if (
            tab.discarded ||
            // FIXME: use `URLS.supported`?
            !/^(http|ftp|file)/.test(tab.url) &&
            !tab.url.startsWith('chrome://newtab/') &&
            !isExtension ||
            isExtension && ignoreExtension ||
            filter && !filter(tab)
          ) {
            continue;
          }
          const dataObj = typeof data === 'function' ? data(tab) : data;
          if (!dataObj) {
            continue;
          }
          const message = {data: dataObj, target};
          if (tab && tab.id) {
            requests.push(
              tabSend(tab.id, message, options)
                .then(unwrapData)
                .catch(ignoreError)
            );
          }
        }
        return Promise.all(requests);
      });
  }

  function broadcastExtension(...args) {
    return send(...args).catch(ignoreError);
  }

  function on(fn) {
    initHandler();
    handler.both.push(fn);
  }

  function onTab(fn) {
    initHandler();
    handler.tab.push(fn);
  }

  function onExtension(fn) {
    initHandler();
    handler.extension.push(fn);
  }

  function off(fn) {
    for (const type of ['both', 'tab', 'extension']) {
      const index = handler[type].indexOf(fn);
      if (index >= 0) {
        handler[type].splice(index, 1);
      }
    }
  }

  function initHandler() {
    if (handler) {
      return;
    }
    handler = {
      both: [],
      tab: [],
      extension: []
    };
    if (isBg) {
      window._msg.handler = handler;
    }
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  function executeCallbacks(callbacks, ...args) {
    let result;
    for (const fn of callbacks) {
      const data = withPromiseError(fn, ...args);
      if (data !== undefined && result === undefined) {
        result = data;
      }
    }
    return result;
  }

  function handleMessage(message, sender, sendResponse) {
    const handlers = message.target === 'tab' ?
      handler.tab.concat(handler.both) : message.target === 'extension' ?
      handler.extension.concat(handler.both) :
      handler.both.concat(handler.extension, handler.tab);
    if (!handlers.length) {
      return;
    }
    const result = executeCallbacks(handlers, message.data, sender);
    if (result === undefined) {
      return;
    }
    Promise.resolve(result)
      .then(
        data => ({
          error: false,
          data
        }),
        err => ({
          error: true,
          data: Object.assign({
            message: err.message || String(err),
            // FIXME: do we want to pass the entire stack?
            stack: err.stack
          }, err) // this allows us to pass custom properties e.g. `err.index`
        })
      )
      .then(sendResponse);
    return true;
  }

  function withPromiseError(fn, ...args) {
    try {
      return fn(...args);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // {type, error, data, id}
  function unwrapData(result) {
    if (result === undefined) {
      throw new Error('Receiving end does not exist');
    }
    if (result.error) {
      throw Object.assign(new Error(result.data.message), result.data);
    }
    return result.data;
  }
})();

self.API = self.INJECTED === 1 ? self.API : new Proxy({
  // Handlers for these methods need sender.tab.id which is set by `send` as it uses messaging,
  // unlike `sendBg` which invokes the background page directly in our own extension tabs
  getTabUrlPrefix: true,
  updateIconBadge: true,
  styleViaAPI: true,
}, {
  get: (target, name) =>
    (...args) => Promise.resolve(self.msg[target[name] ? 'send' : 'sendBg']({
      method: 'invokeAPI',
      name,
      args
    }))
});
