export default function createWorker(name, {lifeTime = 300} = {}) {
  let worker;
  let lastId;
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
    lastId = 0;
    worker = new Worker(`/js/${name}.js`);
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
    if (id === lastId) lastId--;
  }

  function invoke(action, args) {
    return new Promise((resolve, reject) => {
      lastId++;
      pendingResponse.set(lastId, {resolve, reject});
      clearTimeout(timer);
      worker.postMessage({id: lastId, action, args});
    });
  }
}
