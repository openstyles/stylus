/* global promisify CHROME URLS */
/* exported navigatorUtil */
'use strict';

const navigatorUtil = (() => {
  const handler = {
    urlChange: null
  };
  const tabGet = promisify(chrome.tabs.get.bind(chrome.tabs));
  return extendNative({onUrlChange});

  function onUrlChange(fn) {
    initUrlChange();
    handler.urlChange.push(fn);
  }

  function initUrlChange() {
    if (handler.urlChange) {
      return;
    }
    handler.urlChange = [];

    chrome.webNavigation.onCommitted.addListener(data =>
      fixNTPUrl(data)
        .then(() => executeCallbacks(handler.urlChange, data, 'committed'))
        .catch(console.error)
    );

    chrome.webNavigation.onHistoryStateUpdated.addListener(data =>
      fixNTPUrl(data)
        .then(() => executeCallbacks(handler.urlChange, data, 'historyStateUpdated'))
        .catch(console.error)
    );

    chrome.webNavigation.onReferenceFragmentUpdated.addListener(data =>
      fixNTPUrl(data)
        .then(() => executeCallbacks(handler.urlChange, data, 'referenceFragmentUpdated'))
        .catch(console.error)
    );
  }

  function fixNTPUrl(data) {
    if (
      !CHROME ||
      !URLS.chromeProtectsNTP ||
      !data.url.startsWith('https://www.google.') ||
      !data.url.includes('/_/chrome/newtab?')
    ) {
      return Promise.resolve();
    }
    return tabGet(data.tabId)
      .then(tab => {
        if (tab.url === 'chrome://newtab/') {
          data.url = tab.url;
        }
      });
  }

  function executeCallbacks(callbacks, data, type) {
    for (const cb of callbacks) {
      cb(data, type);
    }
  }

  function extendNative(target) {
    return new Proxy(target, {
      get: (target, prop) => {
        if (target[prop]) {
          return target[prop];
        }
        return chrome.webNavigation[prop].addListener.bind(chrome.webNavigation[prop]);
      }
    });
  }
})();
