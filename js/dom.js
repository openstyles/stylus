/* global FIREFOX UA */// toolbox.js
/* global prefs */
'use strict';

/* exported
  $createLink
  $isTextInput
  $remove
  $$remove
  animateElement
  focusAccessibility
  getEventKeyName
  messageBoxProxy
  moveFocus
  scrollElementIntoView
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
const focusAccessibility = {
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
function $create(selector = 'div', properties, children) {
  let ns, tag, opt;
  if (typeof selector === 'string') {
    if (Array.isArray(properties) ||
        properties instanceof Node ||
        typeof properties !== 'object') {
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
    children = opt.appendChild || properties;
  }
  if (tag && tag.includes(':')) {
    [ns, tag] = tag.split(':');
    if (ns === 'SVG' || ns === 'svg') {
      ns = 'http://www.w3.org/2000/svg';
    }
  }
  const element = ns ? document.createElementNS(ns, tag) :
    tag === 'fragment' ? document.createDocumentFragment() :
      document.createElement(tag || 'div');
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) {
      element.appendChild(child instanceof Node ? child : document.createTextNode(child));
    }
  }
  for (const [key, val] of Object.entries(opt)) {
    switch (key) {
      case 'dataset':
        Object.assign(element.dataset, val);
        break;
      case 'attributes':
        Object.entries(val).forEach(attr => element.setAttribute(...attr));
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
        if (ns) {
          const i = key.indexOf(':') + 1;
          const attrNS = i && `http://www.w3.org/1999/${key.slice(0, i - 1)}`;
          element.setAttributeNS(attrNS || null, key, val);
        } else {
          element[key] = val;
        }
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
      ? e.key.length === 1 && letterAsCode ? e.code : e.key
      : 'Mouse' + ('LMR'[e.button] || e.button)
  }`;
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
    if (!el.disabled && el.tabIndex >= 0) {
      el.focus();
      // suppress focus outline when invoked via click
      toggleDataset(el, 'focusedViaClick', focusAccessibility.lastFocusedViaClick);
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

/**
 * Accepts an array of pref names (values are fetched via prefs.get)
 * and establishes a two-way connection between the document elements and the actual prefs
 */
function setupLivePrefs(ids) {
  let init = true;
  // getElementsByTagName is cached so it's much faster than calling querySelector for each id
  ids = ids ? [...ids] : prefs.knownKeys.filter(id => id in document.getElementsByTagName('*'));
  prefs.subscribe(ids, updateElement, {runNow: true});
  init = false;
  function onChange() {
    if (this.checkValidity() && (this.type !== 'radio' || this.checked)) {
      prefs.set(this.id || this.name, getValue(this));
    }
  }
  function getValue(el) {
    const type = el.dataset.valueType || el.type;
    return type === 'checkbox' ? el.checked :
      // https://stackoverflow.com/questions/18062069/why-does-valueasnumber-return-nan-as-a-value
      // valueAsNumber is not applicable for input[text/radio] or select
      type === 'number' ? Number(el.value) :
      el.value;
  }
  function isSame(el, oldValue, value) {
    return el.type === 'radio' ? el.checked === (oldValue === value) :
      el.localName === 'select' && typeof value === 'boolean' && oldValue === `${value}` ||
      oldValue === value;
  }
  function updateElement(id, value) {
    const byId = document.getElementById(id);
    const els = byId ? [byId] : document.getElementsByName(id);
    if (!els.length) {
      prefs.unsubscribe(id, updateElement);
      return;
    }
    for (const el of els) {
      const oldValue = getValue(el);
      if (!isSame(el, oldValue, value)) {
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
  await require(['/spinner.css']);
  parent = parent instanceof Node ? parent : $(parent);
  parent.appendChild($create('.lds-spinner',
    new Array(12).fill($create('div')).map(e => e.cloneNode())));
}

function toggleDataset(el, prop, state) {
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

prefs.ready.then(() => {
  waitForSelector('details[data-pref]', {
    recur(elems) {
      for (const el of elems) {
        prefs.subscribe(el.dataset.pref, updateOnPrefChange, {runNow: true});
        new MutationObserver(saveOnChange)
          .observe(el, {attributes: true, attributeFilter: ['open']});
      }
    },
  });
  function canSave(el) {
    return !el.matches('.compact-layout .ignore-pref-if-compact');
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
  const lazyScripts = [
    '/js/dom-on-load',
  ];
  if (!UA.windows) $.rootCL.add('non-windows');
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
        return width;
      },
    });
    prefs.ready.then(() => dom.setHWProp(prefs.get(HWprefId)));
    lazyScripts.push('/js/header-resizer');
  }
  // add favicon in FF
  if (FIREFOX) {
    for (const size of [38, 32, 19, 16]) {
      document.head.appendChild($create('link', {
        rel: 'icon',
        href: `/images/icon/${size}.png`,
        sizes: size + 'x' + size,
      }));
    }
  }
  window.requestIdleCallback(() => {
    require(lazyScripts);
  });
})();

//#endregion
