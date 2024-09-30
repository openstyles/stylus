/* global FIREFOX UA hasOwn */// toolbox.js
/* global prefs */
'use strict';

/* exported
  $createLink
  $isTextInput
  $remove
  $$remove
  animateElement
  focusA11y
  getEventKeyName
  important
  messageBoxProxy
  moveFocus
  scrollElementIntoView
  setInputValue
  setupLivePrefs
  showSpinner
  toggleDataset
*/

Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
});

//#region Exports

$.root = document.documentElement;
$.rootCL = $.root.classList;

// Makes the focus outline appear on keyboard tabbing, but not on mouse clicks.
const focusA11y = {
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

/**
 * Autoloads message-box.js
 * @alias messageBox
 */
window.messageBoxProxy = new Proxy({}, {
  get(_, name) {
    return async (...args) => {
      await require([
        '/js/dlg/message-box', /* global messageBox */
        '/js/dlg/message-box.css',
      ]);
      window.messageBoxProxy = messageBox;
      return messageBox[name](...args);
    };
  },
});

function $(selector, base) {
  // we have ids with . like #manage.onlyEnabled which looks like #id.class
  // so since getElementById is superfast we'll try it anyway
  const byId = !base && selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || (base || document).querySelector(selector);
}

function $$(selector, base = document) {
  return [...base.querySelectorAll(selector)];
}

function $isTextInput(el = {}) {
  return el.localName === 'textarea' ||
    el.localName === 'input' && /^(text|search|number)$/.test(el.type);
}

function $remove(selector, base = document) {
  const el = selector && typeof selector === 'string' ? $(selector, base) : selector;
  if (el) {
    el.remove();
  }
}

function $$remove(selector, base = document) {
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
function $create(selector = 'div', properties, children) {
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

function $createLink(href = '', content) {
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

/**
 * @param {HTMLElement} el
 * @param {string} [cls] - class name that defines or starts an animation
 * @param [removeExtraClasses] - class names to remove at animation end in the *same* paint frame,
 *        which is needed in e.g. Firefox as it may call resolve() in the next frame
 * @returns {Promise<void>}
 */
function animateElement(el, cls = 'highlight', ...removeExtraClasses) {
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

function getEventKeyName(e, letterAsCode) {
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

function important(str) {
  return str.replace(/;/g, '!important;');
}

/**
 * Switches to the next/previous keyboard-focusable element.
 * Doesn't check `visibility` or `display` via getComputedStyle for simplicity.
 * @param {HTMLElement} rootElement
 * @param {Number} step - for exmaple 1 or -1 (or 0 to focus the first focusable el in the box)
 * @returns {HTMLElement|false|undefined} -
 *   HTMLElement: focus changed,
 *   false: focus unchanged,
 *   undefined: nothing to focus
 */
function moveFocus(rootElement, step) {
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
      toggleDataset(el, 'focusedViaClick', focusA11y.lastFocusedViaClick);
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
function scrollElementIntoView(element, {invalidMarginRatio = 0} = {}) {
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

function setInputValue(input, value) {
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
 * Accepts an array of pref names (values are fetched via prefs.get)
 * or an element inside which to look for elements with known pref ids
 * and establishes a two-way connection between the document elements and the actual prefs
 */
function setupLivePrefs(ids) {
  let init = true;
  // getElementsByTagName is cached so it's much faster than calling querySelector for each id
  const all = (ids instanceof Element ? ids : document).getElementsByTagName('*');
  ids = Array.isArray(ids) ? [...ids] : prefs.knownKeys.filter(id => id in all);
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
      if ((init || diff) && el.type === 'select-one' && el.classList.contains('fit-width')) {
        fitSelectBox(el, value, init); /* global fitSelectBox */// manage/render.js
      } else if (diff) {
        if (el.type === 'radio') {
          el.checked = value === oldValue;
        } else if (el.type === 'checkbox') {
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
async function showSpinner(parent) {
  await require(['/css/spinner.css']);
  parent = parent instanceof Node ? parent : $(parent);
  return parent.appendChild($create('.lds-spinner',
    new Array(12).fill($create('div')).map(e => e.cloneNode())));
}

function toggleDataset(el, prop, state) {
  if (!el) return;
  const wasEnabled = el.dataset[prop] != null; // avoids mutating DOM unnecessarily
  if (state) {
    if (!wasEnabled) el.dataset[prop] = '';
  } else {
    if (wasEnabled) delete el.dataset[prop];
  }
}

/**
 * @param {string} selector - beware of $ quirks with `#dotted.id` that won't work with $$
 * @param {Object} [opt]
 * @param {function(HTMLElement[]):boolean} [opt.recur] - called on each match until stopOnDomReady,
   you can also return `false` to disconnect the observer
 * @param {boolean} [opt.stopOnDomReady] - stop observing on DOM ready
 * @returns {Promise<HTMLElement>} - resolves on first match
 */
function waitForSelector(selector, {recur, stopOnDomReady = true} = {}) {
  let el = $(selector);
  let elems;
  return el && (!recur || recur(elems = $$(selector)) === false)
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
        return n.tagName && (n.matches(selector) || n.firstElementChild && $(selector, n));
      }
      function callRecur([m0, m1]) {
        // Checking addedNodes if only 1 MutationRecord to skip simple mutations quickly
        if (m1 || (m0 = m0.addedNodes)[3] || [].some.call(m0, isMatching)) {
          const all = $$(selector); // Using one $$ call instead of ~100 calls for each node
          const added = !elems ? all : all.filter(el => !elems.includes(el));
          if (added.length) {
            elems = all;
            return recur(added);
          }
        }
      }
    });
}

//#endregion
//#region Internals

const dom = {};

prefs.subscribe('disableAll', (_, val) => {
  $.rootCL.toggle('all-disabled', val);
}, true);

prefs.ready.then(() => {
  waitForSelector('details[data-pref]', {
    recur(elems) {
      for (const el of elems) {
        prefs.subscribe(el.dataset.pref, updateOnPrefChange, true);
        new MutationObserver(saveOnChange)
          .observe(el, {attributes: true, attributeFilter: ['open']});
      }
    },
  });
  function canSave(el) {
    return !el.matches('.ignore-pref, .compact-layout .ignore-pref-if-compact');
  }
  /** @param {MutationRecord[]} _ */
  function saveOnChange([{target: el}]) {
    if (canSave(el)) {
      prefs.set(el.dataset.pref, el.open);
    }
  }
  function updateOnPrefChange(key, value) {
    const el = $(`details[data-pref="${key}"]`);
    if (el.open !== value && canSave(el)) {
      el.open = value;
    }
  }
});

(() => {
  const cls = (!UA.windows ? 'non-windows ' : '') +
    (FIREFOX ? 'firefox' : UA.opera ? 'opera' : UA.vivaldi ? 'vivaldi' : '');
  if (cls) $.root.className += ' ' + cls;
  // set language for a) CSS :lang pseudo and b) hyphenation
  $.root.setAttribute('lang', chrome.i18n.getUILanguage());
  // set up header width resizer
  const HW = 'headerWidth.';
  const HWprefId = HW + location.pathname.match(/^.(\w*)/)[1];
  if (prefs.knownKeys.includes(HWprefId)) {
    Object.assign(dom, {
      HW,
      HWprefId,
      setHWProp(width) {
        // If this is a small window on a big monitor the user can maximize it later
        const max = (innerWidth < 850 ? screen.availWidth : innerWidth) / 3;
        width = Math.round(Math.max(200, Math.min(max, Number(width) || 0)));
        $.root.style.setProperty('--header-width', width + 'px');
        dom.HWval = width;
        return width;
      },
    });
    prefs.ready.then(() => dom.setHWProp(prefs.get(HWprefId)));
  }
  window.on('load', () => require(['/js/dom-on-load']), {once: true});
})();

//#endregion
