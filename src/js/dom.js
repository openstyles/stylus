Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
});
for (const {prototype} of [Document, DocumentFragment, Element]) {
  prototype.$ = prototype.querySelector;
  prototype.$$ = prototype.querySelectorAll;
}
Object.assign(Element.prototype, {
  /**
   * @param {AppendableElementGuts} guts
   */
  $guts(guts) {
    if (typeof guts === 'string') this.textContent = guts;
    else if (Array.isArray(guts)) this.append(...guts);
    else if (guts instanceof Node) this.appendChild(guts);
    else return;
    return this;
  },
  // $set(props, dataset) {
  //   if (dataset) Object.assign(this.dataset, dataset);
  //   return props ? Object.assign(this, props) : this;
  // },
});

export const cssFieldSizing = __.MV3 || CSS.supports('field-sizing', 'content');
export const mqCompact = $rootCL.contains('normal-layout') && matchMedia('(max-width: 850px)');
export const dom = {};

const detachments = new WeakMap();

export function $isTextInput(el = {}) {
  return el.localName === 'textarea' ||
    el.localName === 'input' && /^(text|search|number)$/.test(el.type);
}

/**
 * Props and guts are omittable e.g. (selector), (selector, props), (selector, guts)
 * @param {Tag | string} selector - 'tag#id.cls1.cls2', all optional, tag is 'div' by default
 * @param {WritableElementProps | AppendableElementGuts} [props]
 * @param {AppendableElementGuts | Extras} [guts]
 * @param {Extras} [extras]
 * @return {HTMLElementTagNameMap[Tag] | HTMLElement}
 * @template {ElementTags} Tag
 * @template {{data?:{}, attr?:{}}} Extras
 */
export function $create(selector, props, guts, extras) {
  const tic = selector.split('.');
  const ti = tic[0].split('#');
  const el = $tag(ti[0] || 'div');
  if (ti[1]) el.id = ti[1];
  if (tic.length > 1) {
    el.className = tic.length > 2 ? tic.slice(1).join(' ') : tic[1];
  }
  if (props != null && (
    typeof props === 'string' ? (el.textContent = props, true)
      : Array.isArray(props) ? (el.append(...props), true)
        : props instanceof Node ? (el.appendChild(props), true)
          : props && (Object.assign(el, props), false))) {
    extras = guts;
    guts = null;
  }
  if (guts != null) {
    if (typeof guts === 'string') el.textContent = guts;
    else if (Array.isArray(guts)) el.append(...guts);
    else if (guts instanceof Node) el.appendChild(guts);
  }
  if (extras) {
    if ((props = extras.data)) Object.assign(el.dataset, props);
    if ((props = extras.attr)) for (const a in props) el.setAttribute(a, props[a]);
  }
  return el;
}

/** Moves child nodes to a new document fragment */
export function $createFragment(nodes) {
  const bin = document.createDocumentFragment();
  bin.append(...nodes);
  return bin;
}

export function $createLink(href, content) {
  const opt = {
    target: '_blank',
    rel: 'noopener',
  };
  if (href) {
    if (typeof href === 'string') opt.href = href;
    else Object.assign(opt, href);
  }
  return $create('a', opt, content);
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

export function $$remove(selector, base = document) {
  for (const el of base.$$(selector)) {
    el.remove();
  }
}

/**
 * construct a new className:
 * 1. add a class if value is truthy
 * 2. remove a class if value is falsy
 * 3. keep existing classes otherwise
 * @param {HTMLElement} el
 * @param {object} newClasses
 */
export function $toggleClasses(el, newClasses) {
  const list = new Set(el.className.split(/\s+/));
  for (const c in newClasses) if (newClasses[c]) list.add(c); else list.delete(c);
  const res = [...list].join(' ');
  if (res !== el.className) el.className = res;
}

export function $toggleDataset(el, prop, state) {
  if (!el) return;
  const ds = el.dataset;
  const wasEnabled = ds[prop] != null; // avoids mutating DOM unnecessarily
  if (state) {
    if (!wasEnabled) ds[prop] = typeof state === 'string' ? state : '';
  } else {
    if (wasEnabled) delete ds[prop];
  }
}
