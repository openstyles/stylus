/* global promisify deepCopy */
// deepCopy is only used if the script is executed in extension pages.
'use strict';

const msg = (() => {
  let isBg = false;
  if (chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage() === window) {
    isBg = true;
    window._msg = {
      id: 1,
      storage: new Map()
    };
  }
  const runtimeSend = promisify(chrome.runtime.sendMessage.bind(chrome.runtime));
  const tabSend = chrome.tabs && promisify(chrome.tabs.sendMessage.bind(chrome.tabs));
  const tabQuery = chrome.tabs && promisify(chrome.tabs.query.bind(chrome.tabs));
  let bg;
  const preparing = !isBg && chrome.runtime.getBackgroundPage &&
    promisify(chrome.runtime.getBackgroundPage.bind(chrome.runtime))()
      .catch(() => null)
      .then(_bg => {
        bg = _bg;
      });
  bg = isBg ? window : !preparing ? null : undefined;
  const EXTENSION_URL = chrome.runtime.getURL('');
  let handler;
  const from_ = location.href.startsWith(EXTENSION_URL) ? 'extension' : 'content';
  return {
    send,
    sendTab,
    sendBg,
    broadcast,
    broadcastTab,
    broadcastExtension: send, // alias of send
    on,
    onTab,
    onExtension,
    off
  };

  function send(data, target = 'extension') {
    if (bg === undefined) {
      return preparing.then(() => send(data, target));
    }
    const message = {type: 'direct', data, target, from: from_};
    if (bg) {
      exchangeSet(message);
    }
    const request = runtimeSend(message).then(unwrapData);
    if (message.id) {
      return withCleanup(request, () => bg._msg.storage.delete(message.id));
    }
    return request;
  }

  function sendTab(tabId, data, options, target = 'tab') {
    return tabSend(tabId, {type: 'direct', data, target, from: from_}, options)
      .then(unwrapData);
  }

  function sendBg(data) {
    // always wrap doSend in promise
    return preparing.then(doSend);

    function doSend() {
      if (bg) {
        if (!bg._msg.handler) {
          throw new Error('there is no bg handler');
        }
        const handlers = bg._msg.handler.extension.concat(bg._msg.handler.both);
        // FIXME: do we want to deepCopy `data`?
        return Promise.resolve(executeCallbacks(handlers, data, {url: location.href}))
          .then(deepCopy);
      }
      return send(data);
    }
  }

  function broadcast(data, filter) {
    return Promise.all([
      send(data, 'both').catch(console.warn),
      broadcastTab(data, filter, null, true, 'both')
    ]);
  }

  function broadcastTab(data, filter, options, ignoreExtension = false, target = 'tab') {
    return tabQuery()
      .then(tabs => {
        const requests = [];
        for (const tab of tabs) {
          const isExtension = tab.url.startsWith(EXTENSION_URL);
          if (
            tab.discarded ||
            !/^(http|ftp|file)/.test(tab.url) &&
            !tab.url.startsWith('chrome://newtab/') &&
            !isExtension ||
            isExtension && ignoreExtension ||
            !filter(tab.url)
          ) {
            continue;
          }
          const dataObj = typeof data === 'function' ? data(tab) : data;
          if (!dataObj) {
            continue;
          }
          const message = {type: 'direct', data: dataObj, target, from: from_};
          if (isExtension) {
            exchangeSet(message);
          }
          let request = tabSend(tab.id, message, options);
          if (message.id) {
            request = withCleanup(request, () => bg._msg.storage.delete(message.id));
          }
          requests.push(request.catch(console.warn));
        }
        return Promise.all(requests);
      });
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
    bg._msg.handler = handler = {
      both: [],
      tab: [],
      extension: []
    };
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
    if (message.type === 'exchange') {
      const pending = exchangeGet(message, true);
      if (pending) {
        pending.then(response);
        return true;
      }
    }
    return response();

    function response() {
      const result = executeCallbacks(handlers, message.data, sender);
      if (result === undefined) {
        return;
      }
      Promise.resolve(result)
        .then(
          data => ({error: false, data}),
          err => ({error: true, data: err.message || String(err)})
        )
        .then(function doResponse(responseMessage) {
          if (message.from === 'extension' && bg === undefined) {
            return preparing.then(() => doResponse(responseMessage));
          }
          if (message.from === 'extension' && bg) {
            exchangeSet(responseMessage);
          } else {
            responseMessage.type = 'direct';
          }
          return responseMessage;
        })
        .then(sendResponse);
      return true;
    }
  }

  function exchangeGet(message, keepStorage = false) {
    if (bg === undefined) {
      return preparing.then(() => exchangeGet(message, keepStorage));
    }
    message.data = bg._msg.storage.get(message.id);
    if (keepStorage) {
      message.data = deepCopy(message.data);
    } else {
      bg._msg.storage.delete(message.id);
    }
  }

  function exchangeSet(message) {
    const id = bg._msg.id;
    bg._msg.storage.set(id, message.data);
    bg._msg.id++;
    message.type = 'exchange';
    message.id = id;
    delete message.data;
  }

  function withPromiseError(fn, ...args) {
    try {
      return fn(...args);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function withCleanup(p, fn) {
    return p.then(
      result => {
        cleanup();
        return result;
      },
      err => {
        cleanup();
        throw err;
      }
    );

    function cleanup() {
      try {
        fn();
      } catch (err) {
        // pass
      }
    }
  }

  // {type, error, data, id}
  function unwrapData(result) {
    if (result.type === 'exchange') {
      const pending = exchangeGet(result);
      if (pending) {
        return pending.then(unwrap);
      }
    }
    return unwrap();

    function unwrap() {
      if (result.error) {
        throw new Error(result.data);
      }
      return result.data;
    }
  }
})();

const API = new Proxy({}, {
  get: (target, name) =>
    (...args) => msg.sendBg({
      method: 'invokeAPI',
      name,
      args
    })
});
