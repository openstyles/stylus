'use strict';

self.createWorkerApi = methods => {
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
};

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

const loadedUrls = [];
const importScriptsOrig = importScripts;
self.importScripts = (...urls) => {
  const toLoad = urls
    .map(u => u.endsWith('.js') ? u : u + '.js')
    .filter(u => !loadedUrls.includes(u));
  if (toLoad.length) {
    loadedUrls.push(...toLoad);
    importScriptsOrig(...toLoad);
  }
};

const url = new URLSearchParams(location.search).get('url');
if (url) importScripts(url);
