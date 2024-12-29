Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
});
for (const {prototype} of [Document, DocumentFragment, Element]) {
  prototype.$ = prototype.querySelector;
  prototype.$$ = prototype.querySelectorAll;
}
$.root = document.documentElement;
$.rootCL = $.root.classList;

export const cssFieldSizing = __.MV3 || CSS.supports('field-sizing', 'content');
export const mqCompact = $.rootCL.contains('normal-layout') && matchMedia('(max-width: 850px)');
export const dom = {};

const detachments = new WeakMap();

/**
 * We have ids with "." like #manage.onlyEnabled which looks like #id.class
 * so since getElementById is superfast we'll try it anyway
 * @param {string} selector
 * @param {Node} [base]
 * @return {?HTMLElement}
 */
export function $(selector, base) {
  const byId = !base && selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || (base || document).querySelector(selector);
}

/** @returns {NodeListOf<HTMLElement>} */
export function $$(selector, base = document) {
  return base.querySelectorAll(selector);
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
    children = properties;
  }
  const element =
    tag === 'fragment' ? document.createDocumentFragment() :
      document.createElement(tag || 'div');
  if (Array.isArray(children)
      ? (children = children.filter(Boolean)).length
      : children && (children = [children])) {
    element.append(...children);
  }
  for (const [key, val] of Object.entries(opt)) {
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
  return $create(opt, content);
}

export function $detach(el, state = true) {
  let cmt = detachments.get(el);
  state ??= !cmt;
  if (state) {
    if (!cmt) {
      cmt = document.createComment(
        ((cmt = el.id)) ? '#' + cmt :
          ((cmt = el.className)) ? '.' + cmt :
            el.outerHTML);
      detachments.set(el, cmt);
      el.replaceWith(cmt);
    }
  } else {
    if (cmt) {
      cmt.replaceWith(el);
      detachments.delete(el);
    }
  }
  return state;
}

/** Moves child nodes to a new document fragment */
export function $toFragment(el) {
  const bin = document.createDocumentFragment();
  bin.append(...el.childNodes);
  return bin;
}

/**
 * construct a new className:
 * 1. add a class if value is truthy
 * 2. remove a class if value is falsy
 * 3. keep existing classes otherwise
 * @param {HTMLElement} el
 * @param {object} newClasses
 */
export function toggleClasses(el, newClasses) {
  const list = new Set();
  for (const c of el.classList) list.add(c);
  for (const c in newClasses) if (newClasses[c]) list.add(c); else list.delete(c);
  let res = ''; for (const c of list) res += res ? ' ' + c : c;
  if (el.className !== res) el.className = res;
}

export function toggleDataset(el, prop, state) {
  if (!el) return;
  const wasEnabled = el.dataset[prop] != null; // avoids mutating DOM unnecessarily
  if (state) {
    if (!wasEnabled) el.dataset[prop] = typeof state === 'string' ? state : '';
  } else {
    if (wasEnabled) delete el.dataset[prop];
  }
}
