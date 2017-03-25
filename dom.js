'use strict';

if (!/Windows/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('non-windows');
}


function onDOMready() {
  if (document.readyState != 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', function _() {
      document.removeEventListener('DOMContentLoaded', _);
      resolve();
    });
  });
}


function getClickedStyleId(event) {
  return (getClickedStyleElement(event) || {}).styleId;
}


function getClickedStyleElement(event) {
  return event.target.closest('.entry');
}


function scrollElementIntoView(element) {
  // align to the top/bottom of the visible area if wasn't visible
  const bounds = element.getBoundingClientRect();
  if (bounds.top < 0 || bounds.top > innerHeight - bounds.height) {
    element.scrollIntoView(bounds.top < 0);
  }
}


function animateElement(element, {className, remove = false}) {
  return new Promise(resolve => {
    element.addEventListener('animationend', function _() {
      element.removeEventListener('animationend', _);
      element.classList.remove(className);
      // TODO: investigate why animation restarts if the elements is removed in .then()
      if (remove) {
        element.remove();
      }
      resolve();
    });
    element.classList.add(className);
  });
}


function $(selector, base = document) {
  // we have ids with . like #manage.onlyEdited which look like #id.class
  // so since getElementById is superfast we'll try it anyway
  const byId = selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || base.querySelector(selector);
}


function $$(selector, base = document) {
  return [...base.querySelectorAll(selector)];
}
