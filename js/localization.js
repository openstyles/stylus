/* global download */// toolbox.js
'use strict';

//#region Exports

function t(key, params, strict = true) {
  const s = chrome.i18n.getMessage(key, params);
  if (!s && strict) throw `Missing string "${key}"`;
  return s;
}

Object.assign(t, {
  template: {},
  parser: new DOMParser(),
  ALLOWED_TAGS: ['a', 'b', 'code', 'i', 'sub', 'sup', 'wbr'],
  PREFIX: 'i18n-',
  RX_WORD_BREAK: new RegExp([
    '(',
    /[\d\w\u007B-\uFFFF]{10}/,
    '|',
    /[\d\w\u007B-\uFFFF]{5,10}[!-/]/,
    '|',
    /((?!\s)\W){10}/,
    ')',
    /(?!\b|\s|$)/,
  ].map(rx => rx.source || rx).join(''), 'gu'),

  HTML(html) {
    return typeof html !== 'string'
      ? html
      : /<\w+/.test(html) // check for html tags
        ? t.createHtml(html.replace(/>\n\s*</g, '><').trim())
        : document.createTextNode(html);
  },

  NodeList(nodes) {
    if (nodes instanceof Node) {
      nodes = [nodes, ...nodes.getElementsByTagName('*')];
    }
    for (let n = nodes.length; --n >= 0;) {
      const node = nodes[n];
      if (!node.localName) {
        continue;
      }
      if (node.localName === 'template') {
        node.remove();
        t.createTemplate(node);
        continue;
      }
      for (let a = node.attributes.length; --a >= 0;) {
        const attr = node.attributes[a];
        const name = attr.nodeName;
        if (!name.startsWith(t.PREFIX)) {
          continue;
        }
        const type = name.substr(t.PREFIX.length);
        const value = t(attr.value);
        let toInsert, before;
        switch (type) {
          case 'word-break':
            // we already know that: hasWordBreak
            break;
          case 'text':
            before = node.firstChild;
            // fallthrough to text-append
          case 'text-append':
            toInsert = t.createText(value);
            break;
          case 'html': {
            toInsert = t.createHtml(value);
            break;
          }
          default:
            node.setAttribute(type, value);
        }
        t.stopObserver();
        if (toInsert) {
          node.insertBefore(toInsert, before || null);
        }
        node.removeAttribute(name);
      }
    }
  },

  /** Adds soft hyphens every 10 characters to ensure the long words break before breaking the layout */
  breakWord(text) {
    return text.length <= 10 ? text :
      text.replace(t.RX_WORD_BREAK, '$&\u00AD');
  },

  createTemplate(el) {
    const {content} = el;
    const toRemove = [];
    // Compress inter-tag whitespace to reduce DOM tree and avoid space between elements without flex
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!/[\xA0\S]/.test(n.textContent) ||  // allowing \xA0 so as to preserve &nbsp;
          n.nodeType === Node.COMMENT_NODE) {
        toRemove.push(n);
      }
    }
    toRemove.forEach(n => n.remove());
    t.NodeList(content.querySelectorAll('*'));
    t.template[el.dataset.id] = content.childNodes.length > 1 ? content : content.childNodes[0];
  },

  createText(str) {
    return document.createTextNode(t.breakWord(str));
  },

  createHtml(str, trusted) {
    const root = t.parser.parseFromString(str, 'text/html').body;
    if (!trusted) {
      t.sanitizeHtml(root);
    } else if (str.includes('i18n-')) {
      t.NodeList(root);
    }
    const bin = document.createDocumentFragment();
    while (root.firstChild) {
      bin.appendChild(root.firstChild);
    }
    return bin;
  },

  async fetchTemplate(url, name) {
    let el = t.template[name];
    if (!el) {
      el = (await download(url, {responseType: 'document'})).body.firstElementChild;
      t.NodeList(el);
      t.template[name] = el;
    }
    return el;
  },

  sanitizeHtml(root) {
    const toRemove = [];
    const walker = document.createTreeWalker(root);
    for (let n; (n = walker.nextNode());) {
      if (n.nodeType === Node.TEXT_NODE) {
        n.nodeValue = t.breakWord(n.nodeValue);
      } else if (t.ALLOWED_TAGS.includes(n.localName)) {
        for (const attr of n.attributes) {
          if (n.localName !== 'a' || attr.localName !== 'href' || !/^https?:/.test(n.href)) {
            n.removeAttribute(attr.name);
          }
        }
      } else {
        toRemove.push(n);
      }
    }
    for (const n of toRemove) {
      const parent = n.parentNode;
      if (parent) parent.removeChild(n); // not using .remove() as there may be a non-element
    }
  },

  _intl: null,
  _intlY: null,
  _intlYHM: null,
  _intlWYHM: null,

  formatDate(date, needsTime) {
    if (!date) {
      return '';
    }
    try {
      const now = new Date();
      const newDate = new Date(Number(date) || date);
      const needsYear = newDate.getYear() !== now.getYear();
      const needsWeekDay = needsTime && (now - newDate <= 7 * 24 * 3600e3);
      const intlKey = `_intl${needsWeekDay ? 'W' : ''}${needsYear ? 'Y' : ''}${needsTime ? 'HM' : ''}`;
      const intl = t[intlKey] ||
        (t[intlKey] = new Intl.DateTimeFormat([chrome.i18n.getUILanguage(), 'en'], {
          day: 'numeric',
          month: 'short',
          year: needsYear ? '2-digit' : undefined,
          hour: needsTime ? 'numeric' : undefined,
          minute: needsTime ? '2-digit' : undefined,
          weekday: needsWeekDay ? 'long' : undefined,
        }));
      const string = intl.format(newDate);
      return string === 'Invalid Date' ? '' : string;
    } catch (e) {
      return '';
    }
  },
});

//#endregion
//#region Internals

(() => {
  const observer = new MutationObserver(process);
  let observing = false;
  Object.assign(t, {
    stopObserver() {
      if (observing) {
        observing = false;
        observer.disconnect();
      }
    },
  });
  document.addEventListener('DOMContentLoaded', () => {
    process(observer.takeRecords());
    t.stopObserver();
  }, {once: true});

  t.NodeList(document);
  start();

  function process(mutations) {
    mutations.forEach(m => t.NodeList(m.addedNodes));
    start();
  }

  function start() {
    if (!observing) {
      observing = true;
      observer.observe(document, {subtree: true, childList: true});
    }
  }
})();

//#endregion
