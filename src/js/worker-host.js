export default function createWorker({url, lifeTime = 300}) {
  let worker;
  let id;
  let timer;
  const pendingResponse = new Map();
  return new Proxy({}, {
    get(target, prop) {
      return (...args) => {
        if (!worker) init();
        return invoke(prop, args);
      };
    },
  });

  function init() {
    id = 0;
    worker = new Worker('/js/worker-util.js?' + new URLSearchParams({url}));
    worker.onmessage = onMessage;
  }

  function uninit() {
    worker.onmessage = null;
    worker.terminate();
    worker = null;
  }

  function onMessage({data: {id, data, error}}) {
    pendingResponse.get(id)[error ? 'reject' : 'resolve'](data);
    pendingResponse.delete(id);
    if (!pendingResponse.size && lifeTime >= 0) {
      timer = setTimeout(uninit, lifeTime * 1000);
    }
  }

  function invoke(action, args) {
    return new Promise((resolve, reject) => {
      pendingResponse.set(id, {resolve, reject});
      clearTimeout(timer);
      worker.postMessage({id, action, args});
      id++;
    });
  }
}
