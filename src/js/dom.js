Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
});
for (const {prototype} of [Document, DocumentFragment, Element]) {
  prototype.$ = prototype.querySelector;
  prototype.$$ = prototype.querySelectorAll;
}

export const cssFieldSizing = __.MV3 || CSS.supports('field-sizing', 'content');
export const dom = {};

const detachments = new WeakMap();
const getObjectType = /*@__PURE__*/Object.call.bind({}.toString);

export const $isTextInput = ({localName, type} = {}) =>
  localName === 'textarea' ||
  localName === 'input' && (
    type === 'text' ||
    type === 'search' ||
    type === 'number' ||
    type === 'url'
  );

/**
 * Props and guts are omittable e.g. (selector), (selector, props), (selector, guts)
 * @param {Tag | string} selector - 'tag#id.cls1.cls2[data-foo][attr=val]',
 *   all optional, default tag is 'div'
 * @param {WritableElementProps | AppendableElementGuts} [props]
 * @param {AppendableElementGuts} [guts]
 * @return {HTMLElementTagNameMap[Tag] | HTMLElement}
 * @template {ElementTags} Tag
 */
export function $create(selector, props, guts) {
  let el;
  if (!/\W/.test(selector))
    el = $tag(selector);
  else {
    const tica = selector.split('[');
    const tic = tica[0].split('.');
    const ti = tic[0].split('#');
    el = $tag(ti[0] || 'div');
    if (ti[1])
      el.id = ti[1];
    if (tic.length > 1)
      el.className = tic.length > 2 ? tic.slice(1).join(' ') : tic[1];
    for (let i = 1, a; (a = tica[i++]);)
      el.setAttribute((a = a.split(']')[0].split('='))[0], a[1] || '');
  }
  if (props != null) {
    if (getObjectType(props) === '[object Object]') Object.assign(el, props);
    else guts = props;
  }
  if (guts != null) {
    if (typeof guts === 'string') el.textContent = guts;
    else if (Array.isArray(guts)) el.append(...guts);
    else if (guts instanceof Node) el.appendChild(guts);
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
