/* global promisifyChrome deepCopy getOwnTab URLS msg */
'use strict';

// eslint-disable-next-line no-unused-expressions
window.INJECTED !== 1 && (() => {
  promisifyChrome({
    runtime: ['sendMessage'],
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
  const isBg = getExtBg() === window;
  const handler = {
    both: new Set(),
    tab: new Set(),
    extension: new Set(),
  };

  chrome.runtime.onMessage.addListener(handleMessage);

  window.API = new Proxy({}, {
    get(target, name) {
      return async (...args) => {
        const bg = isBg && window || chrome.tabs && (getExtBgIfReady() || await getRuntimeBg());
        const message = {method: 'invokeAPI', name, args};
        // frames and probably private tabs
        if (!bg || window !== parent) return msg.send(message);
        // in FF, the object would become a dead object when the window
        // is closed, so we have to clone the object into background.
        const res = bg.msg._execute(TARGETS.extension, bg.deepCopy(message), {
          frameId: 0,
          tab: NEEDS_TAB_IN_SENDER.includes(name) && await getOwnTab(),
          url: location.href,
        });
        // avoiding an unnecessary `await` microtask сycle
        return deepCopy(res instanceof bg.Promise ? await res : res);
      };
    },
  });

  window.msg = {
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

    isIgnorableError(err) {
      return /Receiving end does not exist|The message port closed before/.test(err.message);
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
        .then(unwrapData);
    },

    sendTab(tabId, data, options, target = 'tab') {
      return browser.tabs.sendMessage(tabId, {data, target}, options)
        .then(unwrapData);
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

  function getExtBg() {
    const fn = chrome.extension.getBackgroundPage;
    return fn && fn();
  }

  function getExtBgIfReady() {
    const bg = getExtBg();
    return bg && bg.document && bg.document.readyState !== 'loading' && bg;
  }

  function getRuntimeBg() {
    return new Promise(resolve =>
      chrome.runtime.getBackgroundPage(bg =>
        resolve(!chrome.runtime.lastError && bg)));
  }

  function handleMessage({data, target}, sender, sendResponse) {
    const res = msg._execute(TARGETS[target] || TARGETS.all, data, sender);
    if (res instanceof Promise) {
      handleResponseAsync(res, sendResponse);
      return true;
    }
    if (res !== undefined) sendResponse({data: res});
  }

  async function handleResponseAsync(promise, sendResponse) {
    try {
      sendResponse({
        data: await promise,
      });
    } catch (err) {
      sendResponse({
        error: true,
        data: Object.assign({
          message: err.message || String(err),
          stack: err.stack,
        }, err), // passing custom properties e.g. `err.index` to unwrapData
      });
    }
  }

  function unwrapData({data, error} = {}) {
    return error
      ? Promise.reject(Object.assign(new Error(data.message), data))
      : data;
  }
})();
