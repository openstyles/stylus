'use strict';

/* exported createWorker */
function createWorker({url, lifeTime = 300}) {
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

/* exported createWorkerApi */
function createWorkerApi(methods) {
  self.onmessage = async ({data: {id, action, args}}) => {
    let data, error;
    try {
      data = await methods[action](...args);
    } catch (err) {
      error = true;
      data = cloneError(err);
    }
    self.postMessage({id, data, error});
  };
}

function cloneError(err) {
  return Object.assign({
    name: err.name,
    stack: err.stack,
    message: err.message,
    lineNumber: err.lineNumber,
    columnNumber: err.columnNumber,
    fileName: err.fileName,
  }, err);
}

if (self.WorkerGlobalScope) {

  const loadedUrls = [];

  self.require = urls => {
    const toLoad = (Array.isArray(urls) ? urls : [urls])
      .map(u => u.endsWith('.js') ? u : u + '.js')
      .filter(u => !loadedUrls.includes(u));
    if (toLoad) {
      loadedUrls.push(...toLoad);
      importScripts(...toLoad);
    }
  };

  const url = new URLSearchParams(location.search).get('url');
  if (url) require(url);
}
