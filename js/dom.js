'use strict';

if (!/^Win\d+/.test(navigator.platform)) {
  document.documentElement.classList.add('non-windows');
}

// polyfill for old browsers to enable [...results] and for-of
for (const type of [NodeList, NamedNodeMap, HTMLCollection, HTMLAllCollection]) {
  if (!type.prototype[Symbol.iterator]) {
    type.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  }
}

{
  // display a full text tooltip on buttons with ellipsis overflow and no inherent title
  const addTooltipsToEllipsized = () => {
    for (const btn of document.getElementsByTagName('button')) {
      if (btn.title && !btn.titleIsForEllipsis ||
          btn.clientWidth === btn.preresizeClientWidth) {
        continue;
      }
      btn.preresizeClientWidth = btn.clientWidth;
      const padding = btn.offsetWidth - btn.clientWidth;
      const displayedWidth = btn.getBoundingClientRect().width - padding;
      if (btn.scrollWidth > displayedWidth) {
        btn.title = btn.textContent;
        btn.titleIsForEllipsis = true;
      } else if (btn.title) {
        btn.title = '';
      }
    }
  };
  // enqueue after DOMContentLoaded/load events
  setTimeout(addTooltipsToEllipsized);
  // throttle on continuous resizing
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(addTooltipsToEllipsized, 100);
  });
}

onDOMready().then(() => {
  const el = $('#firefox-transitions-bug-suppressor');
  if (el) {
    el.remove();
  }
});

if (!chrome.app) {
  // die if unable to access BG directly
  chrome.windows.getCurrent(wnd => {
    if (!BG && wnd.incognito) {
      // private windows can't get bg page
      location.href = '/msgbox/dysfunctional.html';
      throw 0;
    }
  });
  // add favicon in Firefox
  setTimeout(() => {
    if (!window.prefs) {
      return;
    }
    const iconset = ['', 'light/'][prefs.get('iconset')] || '';
    for (const size of [38, 32, 19, 16]) {
      document.head.appendChild($element({
        tag: 'link',
        rel: 'icon',
        href: `/images/icon/${iconset}${size}.png`,
        sizes: size + 'x' + size,
      }));
    }
  });
  // set hyphenation language
  document.documentElement.setAttribute('lang', chrome.i18n.getUILanguage());
}


function onDOMready() {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', function _() {
      document.removeEventListener('DOMContentLoaded', _);
      resolve();
    });
  });
}


function scrollElementIntoView(element) {
  // align to the top/bottom of the visible area if wasn't visible
  const bounds = element.getBoundingClientRect();
  if (bounds.top < 0 || bounds.top > innerHeight - bounds.height) {
    element.scrollIntoView(bounds.top < 0);
  }
}


function animateElement(
  element, {
    className = 'highlight',
    removeExtraClasses = [],
    onComplete,
  } = {}) {
  return element && new Promise(resolve => {
    element.addEventListener('animationend', function _() {
      element.removeEventListener('animationend', _);
      element.classList.remove(
        className,
        // In Firefox, `resolve()` might be called one frame later.
        // This is helpful to clean-up on the same frame
        ...removeExtraClasses
      );
      // TODO: investigate why animation restarts for 'display' modification in .then()
      if (typeof onComplete === 'function') {
        onComplete.call(element);
      }
      resolve();
    });
    if (element.classList.contains(className)) {
      element.classList.remove(className);
      setTimeout(() => element.classList.add(className));
    } else {
      element.classList.add(className);
    }
  });
}


function enforceInputRange(element) {
  const min = Number(element.min);
  const max = Number(element.max);
  const doNotify = () => element.dispatchEvent(new Event('change', {bubbles: true}));
  const onChange = ({type}) => {
    if (type === 'input' && element.checkValidity()) {
      doNotify();
    } else if (type === 'change' && !element.checkValidity()) {
      element.value = Math.max(min, Math.min(max, Number(element.value)));
      doNotify();
    }
  };
  element.addEventListener('change', onChange);
  element.addEventListener('input', onChange);
}


function $(selector, base = document) {
  // we have ids with . like #manage.onlyEnabled which looks like #id.class
  // so since getElementById is superfast we'll try it anyway
  const byId = selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || base.querySelector(selector);
}


function $$(selector, base = document) {
  return [...base.querySelectorAll(selector)];
}


function $element(opt) {
  // tag:              string, default 'div', may include namespace like 'ns#tag'
  // appendChild:      element/string or an array of elements/strings
  // dataset:          object
  // any DOM property: assigned as is
  const [ns, tag] = opt.tag && opt.tag.includes('#')
    ? opt.tag.split('#')
    : [null, opt.tag];
  const element = ns
    ? document.createElementNS(ns === 'SVG' || ns === 'svg' ? 'http://www.w3.org/2000/svg' : ns, tag)
    : document.createElement(tag || 'div');
  const children = opt.appendChild instanceof Array ? opt.appendChild : [opt.appendChild];
  for (const child of children) {
    if (child) {
      element.appendChild(child instanceof Node ? child : document.createTextNode(child));
    }
  }
  delete opt.appendChild;
  delete opt.tag;
  if (opt.dataset) {
    Object.assign(element.dataset, opt.dataset);
    delete opt.dataset;
  }
  if (opt.attributes) {
    for (const attr in opt.attributes) {
      element.setAttribute(attr, opt.attributes[attr]);
    }
    delete opt.attributes;
  }
  if (ns) {
    for (const attr in opt) {
      element.setAttributeNS(null, attr, opt[attr]);
    }
  } else {
    Object.assign(element, opt);
  }
  return element;
}


function makeLink(href = '', content) {
  const opt = {
    tag: 'a',
    target: '_blank',
    rel: 'noopener'
  };
  if (typeof href === 'object') {
    Object.assign(opt, href);
  } else {
    opt.href = href;
    opt.appendChild = content;
  }
  return $element(opt);
}
