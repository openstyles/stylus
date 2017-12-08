'use strict';

// loadScript(script: Array<Promise|string>|string): Promise
// eslint-disable-next-line no-var
var loadScript = (() => {
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
        resolve();
      };
      el.onerror = () => {
        el.onload = null;
        el.onerror = null;
        reject(new Error(`Failed to load script: ${file}`));
      };
      document.head.appendChild(el);
    });
  }

  return files => {
    if (!Array.isArray(files)) {
      files = [files];
    }
    return Promise.all(files.map(f => (typeof f === 'string' ? inject(f) : f)));
  };
})();


(() => {
  let subscribers, observer;
  // natively declared <script> elements in html can't have onload= attribute
  // due to the default extension CSP that forbids inline code (and we don't want to relax it),
  // so we're using MutationObserver to add onload event listener to the script element to be loaded
  window.onDOMscriptReady = (src, timeout = 1000) => {
    if (!subscribers) {
      subscribers = new Map();
      observer = new MutationObserver(observe);
      observer.observe(document.head, {childList: true});
    }
    return new Promise((resolve, reject) => {
      const listeners = subscribers.get(src);
      if (listeners) {
        listeners.push(resolve);
      } else {
        subscribers.set(src, [resolve]);
      }
      // no need to clear the timer since a resolved Promise won't reject anymore
      setTimeout(reject, timeout);
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
    for (const [subscribedSrc, listeners] of subscribers.entries()) {
      if (src.endsWith(subscribedSrc)) {
        return {subscribedSrc, listeners};
      }
    }
  }

  function notifySubscribers(event) {
    this.removeEventListener('load', notifySubscribers);
    const {subscribedSrc, listeners = []} = getSubscribersForSrc(this.src) || {};
    listeners.forEach(fn => fn(event));
    subscribers.delete(subscribedSrc);
    if (!subscribers.size) {
      observer.disconnect();
      observer = null;
      subscribers = null;
    }
  }
})();
