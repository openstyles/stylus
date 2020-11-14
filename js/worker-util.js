'use strict';

const workerUtil = {

  createWorker({url, lifeTime = 300}) {
    let worker;
    let id;
    let timer;
    const pendingResponse = new Map();
    return new Proxy({}, {
      get: (target, prop) =>
        (...args) => {
          if (!worker) {
            init();
          }
          return invoke(prop, args);
        },
    });

    function init() {
      id = 0;
      worker = new Worker(url);
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
  },

  createAPI(methods) {
    self.onmessage = async ({data: {id, action, args}}) => {
      let data, error;
      try {
        data = await methods[action](...args);
      } catch (err) {
        error = true;
        data = workerUtil.cloneError(err);
      }
      self.postMessage({id, data, error});
    };
  },

  cloneError(err) {
    return Object.assign({
      name: err.name,
      stack: err.stack,
      message: err.message,
      lineNumber: err.lineNumber,
      columnNumber: err.columnNumber,
      fileName: err.fileName,
    }, err);
  },

  loadScript(...urls) {
    urls = urls.filter(u => !workerUtil._loadedScripts.has(u));
    if (!urls.length) {
      return;
    }
    self.importScripts(...urls);
    urls.forEach(u => workerUtil._loadedScripts.add(u));
  },

  _loadedScripts: new Set(),
};
