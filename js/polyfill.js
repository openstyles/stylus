'use strict';

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 && (() => {

  if (!Object.entries) {
    Object.entries = obj => Object.keys(obj).map(k => [k, obj[k]]);
  }
  if (!Object.values) {
    Object.values = obj => Object.keys(obj).map(k => obj[k]);
  }

  // the above was shared by content scripts and workers,
  // the rest is only needed for our extension pages
  if (!self.chrome || !self.chrome.tabs) return;

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
