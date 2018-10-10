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


(() => {
  let subscribers, observer;
  // natively declared <script> elements in html can't have onload= attribute
  // due to the default extension CSP that forbids inline code (and we don't want to relax it),
  // so we're using MutationObserver to add onload event listener to the script element to be loaded
  window.onDOMscriptReady = (srcSuffix, timeout = 1000) => {
    if (!subscribers) {
      subscribers = new Map();
      observer = new MutationObserver(observe);
      observer.observe(document.head, {childList: true});
    }
    return new Promise((resolve, reject) => {
      const listeners = subscribers.get(srcSuffix);
      if (listeners) {
        listeners.push(resolve);
      } else {
        subscribers.set(srcSuffix, [resolve]);
      }
      // a resolved Promise won't reject anymore
      setTimeout(() => {
        emptyAfterCleanup(srcSuffix);
        reject(new Error('Timeout'));
      }, timeout);
    });
  };

  return;

  function observe(mutations) {
    for (const {addedNodes} of mutations) {
      for (const n of addedNodes) {
        if (n.src && getSubscribersForSrc(n.src)) {
          n.addEventListener('load', notifySubscribers);
        }
      }
    }
  }

  function getSubscribersForSrc(src) {
    for (const [suffix, listeners] of subscribers.entries()) {
      if (src.endsWith(suffix)) {
        return {suffix, listeners};
      }
    }
  }

  function notifySubscribers(event) {
    this.removeEventListener('load', notifySubscribers);
    for (let data; (data = getSubscribersForSrc(this.src));) {
      data.listeners.forEach(fn => fn(event));
      if (emptyAfterCleanup(data.suffix)) {
        return;
      }
    }
  }

  function emptyAfterCleanup(suffix) {
    if (!subscribers) {
      return true;
    }
    subscribers.delete(suffix);
    if (!subscribers.size) {
      observer.disconnect();
      observer = null;
      subscribers = null;
      return true;
    }
  }
})();
