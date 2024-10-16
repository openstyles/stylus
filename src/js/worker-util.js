export function createWorkerApi(methods) {
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

const loadedUrls = [];
const importScriptsOrig = self.importScripts;
self.importScripts = importScripts;

export function importScripts(...urls) {
  urls = urls.map(u => !loadedUrls.includes(u = `/${process.env.JS}${u}`) && u).filter(Boolean);
  if (urls.length) {
    loadedUrls.push(...urls);
    importScriptsOrig(...urls);
  }
}
