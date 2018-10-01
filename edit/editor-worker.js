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
    let id = 0;
    const pendingResponse = new Map();
    const worker = new Worker('/edit/editor-worker-body.js');
    worker.onmessage = e => {
      const message = e.data;
      pendingResponse.get(message.id)[message.error ? 'reject' : 'resolve'](message.data);
      pendingResponse.delete(message.id);
    };
    return {invoke};

    function invoke(action, args) {
      return new Promise((resolve, reject) => {
        pendingResponse.set(id, {resolve, reject});
        worker.postMessage({
          id,
          action,
          args
        });
        id++;
      });
    }
  }
})();
