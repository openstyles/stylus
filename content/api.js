/* global promisify */
'use strict';

const API = (() => {
  const preparing = promisify(chrome.runtime.getBackgroundPage.bind(chrome.runtime))()
    .catch(() => null);
  const runtimeSendMessage = promisify(chrome.runtime.sendMessage.bind(chrome.runtime));
  return new Proxy(() => {}, {
    get: (target, name) =>
      (...args) => invokeBG(name, args),
  });

  function sendMessage(msg) {
    return runtimeSendMessage(msg)
      .then(result => {
        if (result && result.__ERROR__) {
          throw new Error(result.__ERROR__);
        }
        return result;
      });
  }

  function invokeBG(name, args) {
    return preparing.then(BG => {
      if (!BG) {
        return sendMessage({
          method: 'invokeAPI',
          name,
          args
        });
      }
      // FIXME: why deep-copying input/output?
      if (BG !== window) {
        args = BG.deepCopy(args);
      }
      const fn = BG.API_METHODS[name];
      if (!fn) {
        throw new Error(`unknown API method: ${name}`);
      }
      return Promise.resolve(fn(...args))
        .then(BG.deepCopy);
    });
  }
})();
