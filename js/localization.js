/* global tryCatch */
/* exported tHTML formatDate */
'use strict';

const template = {};
tDocLoader();


function t(key, params) {
  const cache = !params && t.cache[key];
  const s = cache || chrome.i18n.getMessage(key, params);
  if (s === '') {
    throw `Missing string "${key}"`;
  }
  if (!params && !cache) {
    t.cache[key] = s;
  }
  return s;
}


function tHTML(html, tag) {
  // body is a text node without HTML tags
  if (typeof html === 'string' && !tag && /<\w+/.test(html) === false) {
    return document.createTextNode(html);
  }
  if (typeof html === 'string') {
    // spaces are removed; use &nbsp; for an explicit space
    html = html.replace(/>\s+</g, '><').trim();
    if (tag) {
      html = `<${tag}>${html}</${tag}>`;
    }
    const body = t.DOMParser.parseFromString(html, 'text/html').body;
    if (html.includes('i18n-')) {
      tNodeList(body.getElementsByTagName('*'));
    }
    // the html string may contain more than one top-level node
    if (!body.childNodes[1]) {
      return body.firstChild;
    }
    const fragment = document.createDocumentFragment();
    while (body.firstChild) {
      fragment.appendChild(body.firstChild);
    }
    return fragment;
  }
  return html;
}


function tNodeList(nodes) {
  const PREFIX = 'i18n-';

  for (let n = nodes.length; --n >= 0;) {
    const node = nodes[n];
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    if (node.localName === 'template') {
      createTemplate(node);
      continue;
    }
    for (let a = node.attributes.length; --a >= 0;) {
      const attr = node.attributes[a];
      const name = attr.nodeName;
      if (!name.startsWith(PREFIX)) {
        continue;
      }
      const type = name.substr(PREFIX.length);
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
          toInsert = createText(value);
          break;
        case 'html': {
          toInsert = createHtml(value);
          break;
        }
        default:
          node.setAttribute(type, value);
      }
      tDocLoader.pause();
      if (toInsert) {
        node.insertBefore(toInsert, before || null);
      }
      node.removeAttribute(name);
    }
  }

  function createTemplate(node) {
    const elements = node.content.querySelectorAll('*');
    tNodeList(elements);
    template[node.dataset.id] = elements[0];
    // compress inter-tag whitespace to reduce number of DOM nodes by 25%
    const walker = document.createTreeWalker(elements[0], NodeFilter.SHOW_TEXT);
    const toRemove = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      if (!textNode.nodeValue.trim()) {
        toRemove.push(textNode);
      }
    }
    tDocLoader.pause();
    toRemove.forEach(el => el.remove());
  }

  function createText(str) {
    return document.createTextNode(tWordBreak(str));
  }

  function createHtml(value) {
    // <a href=foo>bar</a> are the only recognizable HTML elements
    const rx = /(?:<a\s([^>]*)>([^<]*)<\/a>)?([^<]*)/gi;
    const bin = document.createDocumentFragment();
    for (let m; (m = rx.exec(value)) && m[0];) {
      const [, linkParams, linkText, nextText] = m;
      if (linkText) {
        const href = /\bhref\s*=\s*(\S+)/.exec(linkParams);
        const a = bin.appendChild(document.createElement('a'));
        a.href = href && href[1].replace(/^(["'])(.*)\1$/, '$2') || '';
        a.appendChild(createText(linkText));
      }
      if (nextText) {
        bin.appendChild(createText(nextText));
      }
    }
    return bin;
  }
}


function tDocLoader() {
  t.DOMParser = new DOMParser();
  t.cache = (() => {
    try {
      return JSON.parse(localStorage.L10N);
    } catch (e) {}
  })() || {};
  t.RX_WORD_BREAK = new RegExp([
    '(',
    /[\d\w\u007B-\uFFFF]{10}/,
    '|',
    /[\d\w\u007B-\uFFFF]{5,10}[!-/]/,
    '|',
    /((?!\s)\W){10}/,
    ')',
    /(?!\b|\s|$)/,
  ].map(rx => rx.source || rx).join(''), 'g');

  // reset L10N cache on UI language change
  const UIlang = chrome.i18n.getUILanguage();
  if (t.cache.browserUIlanguage !== UIlang) {
    t.cache = {browserUIlanguage: UIlang};
    localStorage.L10N = JSON.stringify(t.cache);
  }
  const cacheLength = Object.keys(t.cache).length;

  Object.assign(tDocLoader, {
    observer: new MutationObserver(process),
    start() {
      if (!tDocLoader.observing) {
        tDocLoader.observing = true;
        tDocLoader.observer.observe(document, {subtree: true, childList: true});
      }
    },
    stop() {
      tDocLoader.pause();
      document.removeEventListener('DOMContentLoaded', onLoad);
    },
    pause() {
      if (tDocLoader.observing) {
        tDocLoader.observing = false;
        tDocLoader.observer.disconnect();
      }
    },
  });

  tNodeList(document.getElementsByTagName('*'));
  tDocLoader.start();
  document.addEventListener('DOMContentLoaded', onLoad);

  function process(mutations) {
    for (const mutation of mutations) {
      tNodeList(mutation.addedNodes);
    }
    tDocLoader.start();
  }

  function onLoad() {
    document.removeEventListener('DOMContentLoaded', onLoad);
    process(tDocLoader.observer.takeRecords());
    tDocLoader.stop();
    if (cacheLength !== Object.keys(t.cache).length) {
      localStorage.L10N = JSON.stringify(t.cache);
    }
  }
}


function tWordBreak(text) {
  // adds soft hyphens every 10 characters to ensure the long words break before breaking the layout
  return text.length <= 10 ? text :
    text.replace(t.RX_WORD_BREAK, '$&\u00AD');
}


function formatDate(date) {
  return !date ? '' : tryCatch(() => {
    const newDate = new Date(Number(date) || date);
    const string = newDate.toLocaleDateString([t.cache.browserUIlanguage, 'en'], {
      day: '2-digit',
      month: 'short',
      year: newDate.getYear() === new Date().getYear() ? undefined : '2-digit',
    });
    return string === 'Invalid Date' ? '' : string;
  }) || '';
}
