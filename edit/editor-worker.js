'use strict';

// eslint-disable-next-line no-var
var editorWorker = (() => {
  let worker;
  return new Proxy({}, {
    get: (target, prop) =>
      (...args) => {
        if (!worker) {
          worker = createWorker();
        }
        return worker.invoke(prop, args);
      }
  });

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
