import {kHocused, kHocusedAttr} from '@/js/consts';
import {notIncludedInArray} from '@/js/util';
import {$create, $toggleDataset, cssFieldSizing} from './dom';
import * as prefs from './prefs';
import '@/css/spinner.css';

export let configDialog = async (...args) => (
  configDialog = (await import('./dlg/config-dialog')).default
)(...args);

export let messageBox = /*@__PURE__*/new Proxy({}, {
  get: (_, key) => async (...args) => (
    messageBox = (await import('./dlg/message-box')).default
  )[key](...args),
});

/**
 * Hocus-focus.
 * Last event's focusedViaClick.
 * Making the focus outline appear on keyboard tabbing, but not on mouse clicks.
 */
let lastHocus = false;
export const closestHocused = el => el?.closest(`[${kHocusedAttr}]`);
export const isHocused = el => el && kHocused in el.dataset;
export const setLastHocus = (el, state) => el && $toggleDataset(el, kHocused, (lastHocus = state));
export const setHocus = (el, state) => el && $toggleDataset(el, kHocused, state);

/**
 * @param {HTMLElement} el
 * @param {string} [cls] - class name that defines or starts an animation
 * @param [removeExtraClasses] - class names to remove at animation end in the *same* paint frame,
 *        which is needed in e.g. Firefox as it may call resolve() in the next frame
 * @returns {Promise<void>}
 */
export function animateElement(el, cls = 'highlight', ...removeExtraClasses) {
  return !el ? Promise.resolve(el) : new Promise(resolve => {
    let onDone = () => {
      el.classList.remove(cls, ...removeExtraClasses);
      onDone = null;
      resolve();
    };
    requestAnimationFrame(() => {
      if (onDone) {
        const style = getComputedStyle(el);
        if (style.animationName === 'none' || !parseFloat(style.animationDuration)) {
          el.off('animationend', onDone);
          onDone();
        }
      }
    });
    el.on('animationend', onDone, {once: true});
    el.classList.add(cls);
  });
}

/**
 * to avoid a full layout recalc due to changes on body/root
 * we modify the closest focusable element (like input or button or anything with tabindex=0)
 */
export const closestFocusable = el => {
  let labelSeen;
  for (; el; el = el.parentElement) {
    if (el.localName === 'label' && el.control && !labelSeen) {
      el = el.control;
      labelSeen = true;
    }
    if (el.tabIndex >= 0) return el;
  }
};

export function getEventKeyName(e, letterAsCode) {
  const mods =
    (e.shiftKey ? 'Shift-' : '') +
    (e.ctrlKey ? 'Ctrl-' : '') +
    (e.altKey ? 'Alt-' : '') +
    (e.metaKey ? 'Meta-' : '');
  return `${
    mods === e.key + '-' ? '' : mods
  }${
    e.key
      ? !e.key[1] && letterAsCode ? e.code // KeyC
        : e.key[1] ? e.key // Esc
          : e.key.toUpperCase() // C, Shift-C (single letters we use uppercase for consistency)
      : 'Mouse' + ('LMR'[e.button] || e.button)
  }`;
}

/** Declared as `@media condition, name {` */
export function getCssMediaRuleByName(name, cb) {
  for (const sheet of document.styleSheets) {
    for (const {media: m} of sheet.cssRules) {
      if (m && m[1] === name && cb(m) === false) {
        return;
      }
    }
  }
}

export function important(str) {
  return str.replace(/;/g, '!important;');
}

/**
 * Switches to the next/previous keyboard-focusable element.
 * Doesn't check `visibility` or `display` via getComputedStyle for simplicity.
 * @param {HTMLElement} rootElement
 * @param {Number} step - for example 1 or -1 (or 0 to focus the first focusable el in the box)
 * @returns {HTMLElement|false|undefined} -
 *   HTMLElement: focus changed,
 *   false: focus unchanged,
 *   undefined: nothing to focus
 */
export function moveFocus(rootElement, step) {
  const elements = [...rootElement.getElementsByTagName('*')];
  const activeEl = document.activeElement;
  const activeIndex = step ? Math.max(step < 0 ? 0 : -1, elements.indexOf(activeEl)) : -1;
  const num = elements.length;
  if (!step) step = 1;
  for (let i = 1; i <= num; i++) {
    const el = elements[(activeIndex + i * step + num) % num];
    if (!el.disabled && el.tabIndex >= 0 && el.getBoundingClientRect().width) {
      el.focus();
      // suppress focus outline when invoked via click
      setHocus(el, lastHocus);
      return activeEl !== el && el;
    }
  }
}

/**
 * Scrolls `window` or the closest parent with `class="scroller"` if the element is not visible,
 * centering the element in the view
 * @param {HTMLElement} element
 * @param {number} [invalidMarginRatio] - for example, 0.10 will center the element if it's in the top/bottom 10% of the scroller
 */
export function scrollElementIntoView(element, {invalidMarginRatio = 0} = {}) {
  // align to the top/bottom of the visible area if wasn't visible
  if (!element.parentNode) return;
  const {top, height} = element.getBoundingClientRect();
  const {top: parentTop, bottom: parentBottom} = element.parentNode.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  if (top < Math.max(parentTop, windowHeight * invalidMarginRatio) ||
      top > Math.min(parentBottom, windowHeight) - height - windowHeight * invalidMarginRatio) {
    const scroller = element.closest('.scroller') || window;
    scroller.scrollBy(0, top - (scroller.clientHeight || windowHeight) / 2 + height);
  }
}

export function setInputValue(input, value) {
  input.focus();
  input.select();
  // using execCommand to add to the input's undo history
  document.execCommand(value ? 'insertText' : 'delete', false, value);
  // some versions of Firefox ignore execCommand
  if (input.value !== value) {
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }
}

/**
 * Must be called when prefs is ready to properly handle init=true -> subscribe -> init=false
 * Accepts an array of pref names (values are fetched via prefs.get)
 * or an element inside which to look for elements with known pref ids
 * and establishes a two-way connection between the document elements and the actual prefs
 */
export function setupLivePrefs(ids) {
  let init = true;
  // getElementsByTagName is cached so it's much faster than calling querySelector for each id
  const all = (ids instanceof Element ? ids : document).getElementsByTagName('*');
  ids = ids?.forEach ? [...ids] : prefs.knownKeys.filter(id => id in all);
  prefs.subscribe(ids, updateElement, true);
  init = false;
  function onChange() {
    if (this.checkValidity() && (this.type !== 'radio' || this.checked)) {
      prefs.set(this.id || this.name, getValue(this));
    }
  }
  function getValue(el) {
    const type = el.dataset.valueType || el.type;
    return type === 'checkbox' ? el.checked :
      type === 'number' ? parseFloat(el.value) :
      el.value;
  }
  function isSame(el, oldValue, value) {
    return el.type === 'radio' ? el.checked === (oldValue === value) :
      el.localName === 'select' && typeof value === 'boolean' && oldValue === `${value}` ||
      oldValue === value;
  }
  function updateElement(id, value) {
    const byId = all[id];
    const els = byId && byId.id ? [byId] : document.getElementsByName(id);
    if (!els[0]) {
      prefs.unsubscribe(id, updateElement);
      return;
    }
    for (const el of els) {
      const oldValue = getValue(el);
      const diff = !isSame(el, oldValue, value);
      const type = el.type;
      if (type === 'select-one'
      && !cssFieldSizing && (init || diff) && el.classList.contains('fit-width')) {
        fitSelectBox(el, value, init); /* global fitSelectBox */
      } else if (diff) {
        if (type === 'radio') {
          el.checked = value === oldValue;
        } else if (type === 'checkbox') {
          el.checked = value;
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      if (init) el.on('change', onChange);
    }
  }
}

/** @param {string|Node} parent - selector or DOM node */
export function showSpinner(parent) {
  parent = parent instanceof Node ? parent : $(parent);
  return parent.appendChild($create('.lds-spinner',
    new Array(12).fill($create('div')).map(e => e.cloneNode())));
}

/**
 * @param {string} selector - beware of $ quirks with `#dotted.id` that won't work with $$
 * @param {Object} [opt]
 * @param {function(HTMLElement[]):boolean} [opt.recur] - called on each match until stopOnDomReady,
   you can also return `false` to disconnect the observer
 * @param {boolean} [opt.stopOnDomReady] - stop observing on DOM ready
 * @returns {Promise<HTMLElement>} - resolves on first match
 */
export function waitForSelector(selector, {recur, stopOnDomReady = true} = {}) {
  let el = $(selector);
  let elems;
  return el && (!recur || recur(elems = [...$$(selector)]) === false)
    ? Promise.resolve(el)
    : new Promise(resolve => {
      new MutationObserver((mutations, observer) => {
        if (!el) el = $(selector);
        if (!el) return;
        if (!recur ||
            callRecur(mutations) === false ||
            stopOnDomReady && document.readyState === 'complete') {
          observer.disconnect();
        }
        if (resolve) {
          resolve(el);
          resolve = null;
        }
      }).observe(document, {childList: true, subtree: true});
      function isMatching(n) {
        return n.tagName && (n.matches(selector) || n.firstElementChild && n.$(selector));
      }
      function callRecur([m0, m1]) {
        // Checking addedNodes if only 1 MutationRecord to skip simple mutations quickly
        if (m1 || (m0 = m0.addedNodes)[3] || [].some.call(m0, isMatching)) {
          const all = [...$$(selector)]; // Using one $$ call instead of ~100 calls for each node
          const added = !elems ? all : all.filter(notIncludedInArray, elems);
          if (added.length) {
            elems = all;
            return recur(added);
          }
        }
      }
    });
}
