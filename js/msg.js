'use strict';

/** The name is needed when running in content scripts but specifying it in define()
    breaks IDE detection of exports so here's a workaround */
define.currentModule = '/js/msg';

define(require => {
  const {
    URLS,
    deepCopy,
    getOwnTab,
  } = require('/js/toolbox'); // `require` does nothing in content scripts

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

  // TODO: maybe move into polyfill.js and hook addListener to wrap/unwrap automatically
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  const msg = /** @namespace msg */ {

    isBg: getExtBg() === window,

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
      if (!(args[0] instanceof Object)) {
        /* Data from other windows must be deep-copied to allow for GC in Chrome and
           merely survive in FF as it kills cross-window objects when their tab is closed. */
        args = args.map(deepCopy);
      }
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
    const bg = fn && fn();
    return bg === window || bg && bg.msg && bg.msg.isBgReady ? bg : null;
  }

  function onRuntimeMessage({data, target}, sender, sendResponse) {
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

  const apiHandler = !msg.isBg && {
    get({PATH}, name) {
      const fn = () => {};
      fn.PATH = [...PATH, name];
      return new Proxy(fn, apiHandler);
    },
    async apply({PATH: path}, thisObj, args) {
      const bg = getExtBg() ||
        chrome.tabs && await browser.runtime.getBackgroundPage().catch(() => {});
      const message = {method: 'invokeAPI', path, args};
      let res;
      // content scripts, probably private tabs, and our extension tab during Chrome startup
      if (!bg) {
        res = msg.send(message);
      } else {
        res = deepCopy(await bg.msg._execute(TARGETS.extension, message, {
          frameId: 0, // false in case of our Options frame but we really want to fetch styles early
          tab: NEEDS_TAB_IN_SENDER.includes(path.join('.')) && await getOwnTab(),
          url: location.href,
        }));
      }
      return res;
    },
  };
  /** @type {API} */
  const API = msg.isBg ? {} : new Proxy({PATH: []}, apiHandler);

  // easier debugging in devtools console
  window.API = API;
  // easier debugging + apiHandler calls it directly from bg to get data in the same paint frame
  window.msg = msg;

  return {API, msg};
});
