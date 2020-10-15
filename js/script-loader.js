/* exported loadScript */
'use strict';

// loadScript(script: Array<Promise|string>|string): Promise
const loadScript = (() => {
  const cache = new Map();

  function inject(file) {
    if (!cache.has(file)) {
      cache.set(file, doInject(file));
    }
    return cache.get(file);
  }

  function doInject(file) {
    return new Promise((resolve, reject) => {
      let el;
      if (file.endsWith('.js')) {
        el = document.createElement('script');
        el.src = file;
      } else {
        el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = file;
      }
      el.onload = () => {
        el.onload = null;
        el.onerror = null;
        resolve(el);
      };
      el.onerror = () => {
        el.onload = null;
        el.onerror = null;
        reject(new Error(`Failed to load script: ${file}`));
      };
      document.head.appendChild(el);
    });
  }

  return (files, noCache = false) => {
    if (!Array.isArray(files)) {
      files = [files];
    }
    return Promise.all(files.map(f =>
      typeof f !== 'string' ? f :
        noCache ? doInject(f) :
        inject(f)
    ));
  };
})();
