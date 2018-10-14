/* global importScripts */
/* exported workerUtil */
'use strict';

const workerUtil = (() => {
  const loadedScripts = new Set();
  return {createWorker, createAPI, loadScript, cloneError};

  function createWorker({url, lifeTime = 30}) {
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
        }
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

    function onMessage(e) {
      const message = e.data;
      pendingResponse.get(message.id)[message.error ? 'reject' : 'resolve'](message.data);
      pendingResponse.delete(message.id);
      if (!pendingResponse.size && lifeTime >= 0) {
        timer = setTimeout(uninit, lifeTime * 1000);
      }
    }

    function invoke(action, args) {
      return new Promise((resolve, reject) => {
        pendingResponse.set(id, {resolve, reject});
        clearTimeout(timer);
        worker.postMessage({
          id,
          action,
          args
        });
        id++;
      });
    }
  }

  function createAPI(methods) {
    self.onmessage = e => {
      const message = e.data;
      Promise.resolve()
        .then(() => methods[message.action](...message.args))
        .then(result => ({
          id: message.id,
          error: false,
          data: result
        }))
        .catch(err => ({
          id: message.id,
          error: true,
          data: cloneError(err)
        }))
        .then(data => self.postMessage(data));
    };
  }

  function cloneError(err) {
    return Object.assign({
      name: err.name,
      stack: err.stack,
      message: err.message,
      lineNumber: err.lineNumber,
      columnNumber: err.columnNumber,
      fileName: err.fileName
    }, err);
  }

  function loadScript(...scripts) {
    const urls = scripts.filter(u => !loadedScripts.has(u));
    if (!urls.length) {
      return;
    }
    importScripts(...urls);
    urls.forEach(u => loadedScripts.add(u));
  }
})();
