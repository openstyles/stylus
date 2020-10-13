'use strict';

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 && (() => {

  //#region for content scripts and our extension pages

  if (!window.browser || !browser.runtime) {
    const createTrap = (base, parent) => {
      const target = typeof base === 'function' ? () => {} : {};
      target.isTrap = true;
      return new Proxy(target, {
        get: (target, prop) => {
          if (target[prop]) return target[prop];
          if (base[prop] && (typeof base[prop] === 'object' || typeof base[prop] === 'function')) {
            target[prop] = createTrap(base[prop], base);
            return target[prop];
          }
          return base[prop];
        },
        apply: (target, thisArg, args) => base.apply(parent, args)
      });
    };
    window.browser = createTrap(chrome, null);
  }

  /* Promisifies the specified `chrome` methods into `browser`.
    The definitions is an object like this: {
      'storage.sync': ['get', 'set'], // if deeper than one level, combine the path via `.`
      windows: ['create', 'update'], // items and sub-objects will only be created if present in `chrome`
    } */
  window.promisifyChrome = definitions => {
    for (const [scopeName, methods] of Object.entries(definitions)) {
      const path = scopeName.split('.');
      const src = path.reduce((obj, p) => obj && obj[p], chrome);
      if (!src) continue;
      const dst = path.reduce((obj, p) => obj[p] || (obj[p] = {}), browser);
      for (const name of methods) {
        const fn = src[name];
        if (!fn || dst[name] && !dst[name].isTrap) continue;
        dst[name] = (...args) => new Promise((resolve, reject) =>
          fn.call(src, ...args, (...results) =>
            chrome.runtime.lastError ?
              reject(chrome.runtime.lastError) :
              resolve(results.length <= 1 ? results[0] : results)));
              // a couple of callbacks have 2 parameters (we don't use those methods, but just in case)
      }
    }
  };

  if (!chrome.tabs) return;

  //#endregion
  //#region for our extension pages

  for (const storage of ['localStorage', 'sessionStorage']) {
    try {
      window[storage]._access_check = 1;
      delete window[storage]._access_check;
    } catch (err) {
      Object.defineProperty(window, storage, {value: {}});
    }
  }

  if (!(new URLSearchParams({foo: 1})).get('foo')) {
    // TODO: remove when minimum_chrome_version >= 61
    window.URLSearchParams = class extends URLSearchParams {
      constructor(init) {
        if (init && typeof init === 'object') {
          super();
          for (const [key, val] of Object.entries(init)) {
            this.set(key, val);
          }
        } else {
          super(...arguments);
        }
      }
    };
  }
  //#endregion
})();
