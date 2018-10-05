/* global promisify */
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
    broadcast,
    broadcastTab,
    broadcastExtension: send, // alias of send
    onMessage,
    onTabMessage,
    onExtensionMessage
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

  function onMessage(fn) {
    initHandler();
    handler.both.push(fn);
  }

  function onTabMessage(fn) {
    initHandler();
    handler.tab.push(fn);
  }

  function onExtensionMessage(fn) {
    initHandler();
    handler.extension.push(fn);
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
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        let result;
        for (const handle of handlers) {
          const data = handle(message.data, sender);
          if (data !== undefined && result === undefined) {
            result = data;
          }
        }
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
    });
  }

  function exchangeGet(message, keepStorage = false) {
    if (bg === undefined) {
      return preparing.then(() => exchangeGet(message, keepStorage));
    }
    message.data = bg._msg.storage.get(message.id);
    if (!keepStorage) {
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
