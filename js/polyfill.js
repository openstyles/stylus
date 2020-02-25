'use strict';

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 && (() => {

  // this part runs in workers, content scripts, our extension pages

  if (!Object.entries) {
    Object.entries = obj => Object.keys(obj).map(k => [k, obj[k]]);
  }
  if (!Object.values) {
    Object.values = obj => Object.keys(obj).map(k => obj[k]);
  }

  if (!self.chrome) return;
  // the rest is for content scripts and our extension pages

  self.promisifyChrome = definitions => {
    // a web page may have <html id="browser"> which creates a global variable `browser` pointing to this element
    if (!self.browser || !self.browser.runtime && !self.browser.promisifyChrome) {
      self.browser = Object.defineProperty({}, 'promisifyChrome', {value: true});
    }
    for (const [scopeName, methods] of Object.entries(definitions)) {
      const path = scopeName.split('.');
      const src = path.reduce((obj, p) => obj && obj[p], chrome);
      if (!src) continue;
      const dst = path.reduce((obj, p) => obj[p] || (obj[p] = {}), browser);
      for (const name of methods) {
        const fn = src[name];
        if (!fn || dst[name]) continue;
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
  // the rest is for our extension pages

  if (typeof document === 'object') {
    const ELEMENT_METH = {
      append: {
        base: [Element, Document, DocumentFragment],
        fn: (node, frag) => {
          node.appendChild(frag);
        }
      },
      prepend: {
        base: [Element, Document, DocumentFragment],
        fn: (node, frag) => {
          node.insertBefore(frag, node.firstChild);
        }
      },
      before: {
        base: [Element, CharacterData, DocumentType],
        fn: (node, frag) => {
          node.parentNode.insertBefore(frag, node);
        }
      },
      after: {
        base: [Element, CharacterData, DocumentType],
        fn: (node, frag) => {
          node.parentNode.insertBefore(frag, node.nextSibling);
        }
      }
    };

    for (const [key, {base, fn}] of Object.entries(ELEMENT_METH)) {
      for (const cls of base) {
        if (cls.prototype[key]) {
          continue;
        }
        cls.prototype[key] = function (...nodes) {
          const frag = document.createDocumentFragment();
          for (const node of nodes) {
            frag.appendChild(typeof node === 'string' ? document.createTextNode(node) : node);
          }
          fn(this, frag);
        };
      }
    }
  }
  try {
    if (!localStorage) {
      throw new Error('localStorage is null');
    }
    localStorage._access_check = 1;
    delete localStorage._access_check;
  } catch (err) {
    Object.defineProperty(self, 'localStorage', {value: {}});
  }
  try {
    if (!sessionStorage) {
      throw new Error('sessionStorage is null');
    }
    sessionStorage._access_check = 1;
    delete sessionStorage._access_check;
  } catch (err) {
    Object.defineProperty(self, 'sessionStorage', {value: {}});
  }
})();
