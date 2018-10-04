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
        if (result.__ERROR__) {
          throw new Error(result.__ERROR__);
        }
        return result;
      });
  }

  function promisify(fn) {
    return (...args) =>
      new Promise((resolve, reject) => {
        fn(...args, (...result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(
            result.length === 0 ? undefined :
            result.length === 1 ? result[1] : result
          );
        });
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
      return BG.API_METHODS[name](...args)
        .then(BG.deepCopy);
    });
  }
})();
