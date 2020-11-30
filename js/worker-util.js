'use strict';

if (typeof define !== 'function') {
  const defines = {};
  let currentPath = '/js/worker-util.js';

  const require = defines.require = (url, fn) => {
    const deps = [];
    for (let u of Array.isArray(url) ? url : [url]) {
      if (u !== 'require') {
        if (!u.endsWith('.js')) u += '.js';
        if (!u.startsWith('/')) u = new URL(u, location.origin + currentPath).pathname;
        if (u && !defines.hasOwnProperty(u)) {
          currentPath = u;
          importScripts(u);
        }
      }
      deps.push(defines[u]);
    }
    if (typeof fn === 'function') {
      fn(...deps);
    }
    return deps[0];
  };

  self.define = (deps, fn) => {
    if (typeof deps === 'function') {
      defines[currentPath] = deps(require);
    } else if (Array.isArray(deps)) {
      const path = currentPath;
      require(deps, (...res) => {
        defines[path] = fn(...res);
      });
    }
  };
}

define(require => {
  let exports;
  const GUEST = 'url';
  const {cloneError} = exports = {

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

    createAPI(methods) {
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
    },

    createWorker({url, lifeTime = 300}) {
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
        worker = new Worker('/js/worker-util.js?' + new URLSearchParams({[GUEST]: url}));
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
  };

  if (self.WorkerGlobalScope) {
    Promise.resolve().then(() =>
      require(new URLSearchParams(location.search).get(GUEST)));
  }

  return exports;
});
