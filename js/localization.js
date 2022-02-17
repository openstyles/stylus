/* global $$ waitForSelector */// dom.js
/* global download */// toolbox.js
'use strict';

/**
 * <tag i18n="id"> - like el.prepend() inserts the text as the first node
 * <tag i18n="+id"> - like el.append() inserts the text as the last node
 * <tag i18n="html:id"> - sets innerHTML (sanitized)
 * <tag i18n="title: id"> - creates an attribute `title`, spaces are ignored
 * <tag i18n="id, +id2, title:id3, placeholder:id4, data-foo:id5">
 */

function t(key, params, strict = true) {
  const s = chrome.i18n.getMessage(key, params);
  if (!s && strict) throw `Missing string "${key}"`;
  return s;
}

Object.assign(t, {
  template: {},
  ALLOWED_TAGS: ['a', 'b', 'code', 'i', 'sub', 'sup', 'wbr'],
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
  SELECTOR: '[i18n], template',

  HTML(html) {
    return typeof html !== 'string'
      ? html
      : /<\w+/.test(html) // check for html tags
        ? t.createHtml(html.replace(/>\n\s*</g, '><').trim())
        : document.createTextNode(html);
  },

  NodeList(nodes) {
    if (nodes instanceof Node) {
      nodes = $$(t.SELECTOR, nodes).concat(nodes);
    }
    for (const node of nodes) {
      if (!node.localName) continue;
      if (node.localName === 'template') {
        t.createTemplate(node);
        continue;
      }
      const attr = node.getAttribute('i18n');
      if (!attr) continue;
      for (const part of attr.split(',')) {
        let toInsert, before;
        let [type, value] = part.trim().split(/\s*:\s*/);
        if (!value) [type, value] = type.split(/(\w+)/);
        value = t(value);
        switch (type) {
          case '':
            before = node.firstChild;
            // fallthrough
          case '+':
            toInsert = t.createText(value);
            break;
          case 'html': {
            toInsert = t.createHtml(value);
            break;
          }
          default:
            node.setAttribute(type, value);
        }
        if (toInsert) {
          node.insertBefore(toInsert, before || null);
        }
      }
      node.removeAttribute('i18n');
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
    t.NodeList(content);
    return (t.template[el.dataset.id] =
      content.childNodes.length > 1
        ? content
        : content.childNodes[0]);
  },

  createText(str) {
    return document.createTextNode(t.breakWord(str));
  },

  createHtml(str, trusted) {
    const root = t.parse(str);
    if (!trusted) {
      t.sanitizeHtml(root);
    } else if (str.includes('i18n=')) {
      t.NodeList(root);
    }
    return t.toFragment(root);
  },

  fetchTemplate: async (url, name) => t.template[name] ||
    t.createTemplate({
      content: t.toFragment(t.parse(await download(url))),
      dataset: {id: name},
    }),

  parse: str => new DOMParser().parseFromString(str, 'text/html').body,

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

  /** Moves child nodes to a new document fragment */
  toFragment(el) {
    const bin = document.createDocumentFragment();
    for (let n; (n = el.firstChild);) bin.appendChild(n);
    return bin;
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

waitForSelector(t.SELECTOR, {recur: t.NodeList});
