'use strict';

var editorWorker = (() => { // eslint-disable-line no-var
  let worker;
  return createAPI(['csslint', 'stylelint', 'parseMozFormat']);

  function createAPI(keys) {
    const output = {};
    for (const key of keys) {
      output[key] = (...args) => {
        if (!worker) {
          worker = createWorker();
        }
        return worker.invoke(key, args);
      };
    }
    return output;
  }

  function createWorker() {
    let requestId = 0;
    const pending = new Map();
    const worker = new Worker('/edit/editor-worker-body.js');
    worker.onmessage = e => {
      const message = e.data;
      if (message.error) {
        pending.get(message.requestId).reject(message.data);
      } else {
        pending.get(message.requestId).resolve(message.data);
      }
      pending.delete(message.requestId);
    };
    return {invoke};

    function invoke(action, args) {
      return new Promise((resolve, reject) => {
        pending.set(requestId, {resolve, reject});
        worker.postMessage({
          requestId,
          action,
          args
        });
        requestId++;
      });
    }
  }
})();
