'use strict';

// eslint-disable-next-line no-var
var loadScript = (function () {
  const cache = new Map();

  return function (path) {
    if (!path.includes('://')) {
      path = chrome.runtime.getURL(path);
    }
    return new Promise((resolve, reject) => {
      if (cache.has(path)) {
        resolve(cache.get(path));
        return;
      }
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => {
        resolve(script);
        script.onload = null;
        script.onerror = null;

        cache.set(path, script);
      };
      script.onerror = event => {
        reject(new Error(`failed to load script: ${path}`));
        script.onload = null;
        script.onerror = null;
        script.parentNode.removeChild(script);
      };
      document.head.appendChild(script);
    });
  };
})();
