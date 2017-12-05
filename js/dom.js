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

$.remove = (selector, base = document) => {
  const el = selector && typeof selector === 'string' ? $(selector, base) : selector;
  if (el) {
    el.remove();
  }
};

$$.remove = (selector, base = document) => {
  for (const el of base.querySelectorAll(selector)) {
    el.remove();
  }
};

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
  $.remove('#firefox-transitions-bug-suppressor');
});

if (!chrome.app && chrome.windows) {
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
      document.head.appendChild($create('link', {
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


function scrollElementIntoView(element, {invalidMarginRatio = 0} = {}) {
  // align to the top/bottom of the visible area if wasn't visible
  const {top, height} = element.getBoundingClientRect();
  const {top: parentTop, bottom: parentBottom} = element.parentNode.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  if (top < Math.max(parentTop, windowHeight * invalidMarginRatio) ||
      top > Math.min(parentBottom, windowHeight) - height - windowHeight * invalidMarginRatio) {
    window.scrollBy(0, top - windowHeight / 2 + height);
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
    element.classList.add(className);
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


function $create(selector = 'div', properties, children) {
/*
  $create('tag#id.class.class', ?[children])
  $create('tag#id.class.class', ?textContentOrChildNode)
  $create('tag#id.class.class', {properties}, ?[children])
  $create('tag#id.class.class', {properties}, ?textContentOrChildNode)
           tag is 'div' by default, #id and .class are optional

  $create([children])

  $create({propertiesAndOptions})
  $create({propertiesAndOptions}, ?[children])
           tag:              string, default 'div'
           appendChild:      element/string or an array of elements/strings
           dataset:          object
           any DOM property: assigned as is

  tag may include namespace like 'ns:tag'
*/
  let ns, tag, opt;

  if (typeof selector === 'string') {
    if (Array.isArray(properties) ||
        properties instanceof Node ||
        typeof properties !== 'object') {
      opt = {};
      children = properties;
    } else {
      opt = properties || {};
    }
    const idStart = (selector.indexOf('#') + 1 || selector.length + 1) - 1;
    const classStart = (selector.indexOf('.') + 1 || selector.length + 1) - 1;
    const id = selector.slice(idStart + 1, classStart);
    if (id) {
      opt.id = id;
    }
    const cls = selector.slice(classStart + 1);
    if (cls) {
      opt[selector.includes(':') ? 'class' : 'className'] =
        cls.includes('.') ? cls.replace(/\./g, ' ') : cls;
    }
    tag = selector.slice(0, Math.min(idStart, classStart));

  } else if (Array.isArray(selector)) {
    tag = 'div';
    opt = {};
    children = selector;

  } else {
    opt = selector;
    tag = opt.tag;
    delete opt.tag;
    children = opt.appendChild || properties;
    delete opt.appendChild;
  }

  if (tag && tag.includes(':')) {
    ([ns, tag] = tag.split(':'));
  }

  const element = ns
    ? document.createElementNS(ns === 'SVG' || ns === 'svg' ? 'http://www.w3.org/2000/svg' : ns, tag)
    : document.createElement(tag || 'div');

  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) {
      element.appendChild(child instanceof Node ? child : document.createTextNode(child));
    }
  }

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
      const i = attr.indexOf(':') + 1;
      const attrNS = i && `http://www.w3.org/1999/${attr.slice(0, i - 1)}`;
      element.setAttributeNS(attrNS || null, attr, opt[attr]);
    }
  } else {
    Object.assign(element, opt);
  }

  return element;
}


function $createLink(href = '', content) {
  const opt = {
    tag: 'a',
    target: '_blank',
    rel: 'noopener'
  };
  if (typeof href === 'object') {
    Object.assign(opt, href);
  } else {
    opt.href = href;
  }
  opt.appendChild = opt.appendChild || content;
  return $create(opt);
}


function initCollapsibles({bindClickOn = 'h2'} = {}) {
  const prefMap = {};
  const elements = $$('details[data-pref]');

  for (const el of elements) {
    const key = el.dataset.pref;
    prefMap[key] = el;
    el.open = prefs.get(key);
    (bindClickOn && $(bindClickOn, el) || el).addEventListener('click', onClick);
  }

  prefs.subscribe(Object.keys(prefMap), (key, value) => {
    const el = prefMap[key];
    if (el.open !== value) {
      el.open = value;
    }
  });

  function onClick(event) {
    if (event.target.closest('.intercepts-click')) {
      event.preventDefault();
    } else {
      setTimeout(saveState, 0, event.target.closest('details'));
    }
  }

  function saveState(el) {
    prefs.set(el.dataset.pref, el.open);
  }
}
