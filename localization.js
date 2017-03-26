'use strict';

const template = {};
tDocLoader();


function t(key, params) {
  const s = chrome.i18n.getMessage(key, params);
  if (s == '') {
    throw `Missing string "${key}"`;
  }
  return s;
}


function tE(id, key, attr, esc) {
  if (attr) {
    document.getElementById(id).setAttribute(attr, t(key));
  } else if (typeof esc == 'undefined' || esc) {
    document.getElementById(id).appendChild(document.createTextNode(t(key)));
  } else {
    document.getElementById(id).innerHTML = t(key);
  }
}


function tHTML(html) {
  const node = document.createElement('div');
  node.innerHTML = html.replace(/>\s+</g, '><'); // spaces are removed; use &nbsp; for an explicit space
  if (html.includes('i18n-')) {
    tNodeList(node.querySelectorAll('*'));
  }
  return node.firstElementChild;
}


function tNodeList(nodes) {
  for (const node of [...nodes]) {
    // skip non-ELEMENT_NODE
    if (node.nodeType != 1) {
      continue;
    }
    if (node.localName == 'template') {
      tNodeList(node.content.querySelectorAll('*'));
      template[node.dataset.id] = node.content.firstElementChild;
      continue;
    }
    for (const attr of [...node.attributes]) {
      let name = attr.nodeName;
      if (name.indexOf('i18n-') != 0) {
        continue;
      }
      name = name.substr(5); // 'i18n-'.length
      const value = t(attr.value);
      switch (name) {
        case 'text':
          node.insertBefore(document.createTextNode(value), node.firstChild);
          break;
        case 'html':
          node.insertAdjacentHTML('afterbegin', value);
          break;
        default:
          node.setAttribute(name, value);
      }
      node.removeAttribute(attr.nodeName);
    }
  }
}


function tDocLoader() {
  // localize HEAD
  tNodeList(document.all);

  // localize BODY
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      tNodeList(mutation.addedNodes);
    }
  });
  const onLoad = () => {
    tDocLoader.stop();
    tNodeList(document.all);
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
