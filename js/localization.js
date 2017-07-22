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


function tE(id, key, attr, esc) {
  if (attr) {
    document.getElementById(id).setAttribute(attr, t(key));
  } else if (typeof esc === 'undefined' || esc) {
    document.getElementById(id).appendChild(document.createTextNode(t(key)));
  } else {
    document.getElementById(id).innerHTML = t(key);
  }
}


function tHTML(html) {
  const node = document.createElement('div');
  node.innerHTML = html.replace(/>\s+</g, '><'); // spaces are removed; use &nbsp; for an explicit space
  if (html.includes('i18n-')) {
    tNodeList(node.getElementsByTagName('*'));
  }
  return node.firstElementChild;
}


function tNodeList(nodes) {
  const PREFIX = 'i18n-';
  for (let n = nodes.length; --n >= 0;) {
    const node = nodes[n];
    // skip non-ELEMENT_NODE
    if (node.nodeType !== 1) {
      continue;
    }
    if (node.localName === 'template') {
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
      toRemove.forEach(el => el.remove());
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
      switch (type) {
        case 'text':
          node.insertBefore(document.createTextNode(value), node.firstChild);
          break;
        case 'text-append':
          node.appendChild(document.createTextNode(value));
          break;
        case 'html':
          node.insertAdjacentHTML('afterbegin', value);
          break;
        default:
          node.setAttribute(type, value);
      }
      node.removeAttribute(name);
    }
  }
}


function tDocLoader() {
  t.cache = tryJSONparse(localStorage.L10N) || {};

  // reset L10N cache on UI language change
  const UIlang = chrome.i18n.getUILanguage();
  if (t.cache.browserUIlanguage !== UIlang) {
    t.cache = {browserUIlanguage: UIlang};
    localStorage.L10N = JSON.stringify(t.cache);
  }

  const cacheLength = Object.keys(t.cache).length;

  // localize HEAD
  tNodeList(document.getElementsByTagName('*'));

  // localize BODY
  const process = mutations => {
    for (const mutation of mutations) {
      tNodeList(mutation.addedNodes);
    }
  };
  const observer = new MutationObserver(process);
  const onLoad = () => {
    tDocLoader.stop();
    process(observer.takeRecords());
    if (cacheLength !== Object.keys(t.cache).length) {
      localStorage.L10N = JSON.stringify(t.cache);
    }
  };
  tDocLoader.start = () => {
    observer.observe(document, {subtree: true, childList: true});
  };
  tDocLoader.stop = () => {
    observer.disconnect();
    document.removeEventListener('DOMContentLoaded', onLoad);
  };
  tDocLoader.start();
  document.addEventListener('DOMContentLoaded', onLoad);
}
