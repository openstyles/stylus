import {hasOwn} from './toolbox';

Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
});

// TODO: export directly
$.root = document.documentElement;
$.rootCL = $.root.classList;

export const dom = {};

// Makes the focus outline appear on keyboard tabbing, but not on mouse clicks.
export const focusA11y = {
  // last event's focusedViaClick
  lastFocusedViaClick: false,
  get: el => el && el.dataset.focusedViaClick != null,
  toggle: (el, state) => el && toggleDataset(el, 'focusedViaClick', state),
  // to avoid a full layout recalc due to changes on body/root
  // we modify the closest focusable element (like input or button or anything with tabindex=0)
  closest(el) {
    let labelSeen;
    for (; el; el = el.parentElement) {
      if (el.localName === 'label' && el.control && !labelSeen) {
        el = el.control;
        labelSeen = true;
      }
      if (el.tabIndex >= 0) return el;
    }
  },
};

export function $(selector, base) {
  // we have ids with . like #manage.onlyEnabled which looks like #id.class
  // so since getElementById is superfast we'll try it anyway
  const byId = !base && selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || (base || document).querySelector(selector);
}

export function $$(selector, base = document) {
  return [...base.querySelectorAll(selector)];
}

export function $isTextInput(el = {}) {
  return el.localName === 'textarea' ||
    el.localName === 'input' && /^(text|search|number)$/.test(el.type);
}

export function $remove(selector, base = document) {
  const el = selector && typeof selector === 'string' ? $(selector, base) : selector;
  if (el) {
    el.remove();
  }
}

export function $$remove(selector, base = document) {
  for (const el of base.querySelectorAll(selector)) {
    el.remove();
  }
}

/**
 * All parameters are omittable e.g. (), (sel), (props, children), (children)
 * All parts of `selector` are optional, tag is 'div' by default.
 * `children` is a string (textContent) or Node or array of text/nodes
 * `properties` is an object with some special keys:
   tag:         string, default 'div'
   appendChild: element/string or an array of elements/strings
   attributes:  {'html-case-name': val, ...} via setAttribute
   dataset:     {camelCaseName: val, ...} via Object.assign
   'data-attr-name': val via setAttribute
   'attr:name':      val via setAttribute without prefix
   anythingElse:     val via el[key] assignment
 */
export function $create(selector = 'div', properties, children) {
  let tag, opt;
  if (typeof selector === 'string') {
    if (Array.isArray(properties) ||
        properties instanceof Node ||
        typeof properties !== 'object' && children == null) {
      opt = {};
      children = properties;
    } else {
      opt = properties || {};
      children = children || opt.appendChild;
    }
    const idStart = (selector.indexOf('#') + 1 || selector.length + 1) - 1;
    const classStart = (selector.indexOf('.') + 1 || selector.length + 1) - 1;
    const id = selector.slice(idStart + 1, classStart);
    if (id) {
      opt.id = id;
    }
    const cls = selector.slice(classStart + 1);
    if (cls) opt.className = cls.replace(/\./g, ' ');
    tag = selector.slice(0, Math.min(idStart, classStart));
  } else if (Array.isArray(selector)) {
    tag = 'div';
    opt = {};
    children = selector;
  } else {
    opt = selector;
    tag = opt.tag;
    children = opt.appendChild || properties;
  }
  const element =
    tag === 'fragment' ? document.createDocumentFragment() :
      document.createElement(tag || 'div');
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) {
      element.appendChild(child instanceof Node ? child : document.createTextNode(child));
    }
  }
  for (const key in opt) {
    if (!hasOwn(opt, key)) continue;
    const val = opt[key];
    switch (key) {
      case 'dataset':
        Object.assign(element.dataset, val);
        break;
      case 'attributes':
        if (val) Object.entries(val).forEach(attr => element.setAttribute(...attr));
        break;
      case 'style': {
        const t = typeof val;
        if (t === 'string') element.style.cssText = val;
        if (t === 'object') Object.assign(element.style, val);
        break;
      }
      case 'tag':
      case 'appendChild':
        break;
      default: {
        if (key.startsWith('attr:')) element.setAttribute(key.slice(5), val);
        else if (key.startsWith('data-')) element.setAttribute(key, val);
        else element[key] = val;
      }
    }
  }
  return element;
}

export function $createLink(href = '', content) {
  const opt = {
    tag: 'a',
    target: '_blank',
    rel: 'noopener',
  };
  if (typeof href === 'object') {
    Object.assign(opt, href);
  } else {
    opt.href = href;
  }
  opt.appendChild = opt.appendChild || content;
  return $create(opt);
}

export function toggleDataset(el, prop, state) {
  if (!el) return;
  const wasEnabled = el.dataset[prop] != null; // avoids mutating DOM unnecessarily
  if (state) {
    if (!wasEnabled) el.dataset[prop] = '';
  } else {
    if (wasEnabled) delete el.dataset[prop];
  }
}
