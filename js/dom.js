/* global prefs */
/* exported scrollElementIntoView animateElement enforceInputRange $createLink
  setupLivePrefs moveFocus */
'use strict';

if (!/^Win\d+/.test(navigator.platform)) {
  document.documentElement.classList.add('non-windows');
}

Object.assign(EventTarget.prototype, {
  on: addEventListener,
  off: removeEventListener,
  /** args: [el:EventTarget, type:string, fn:function, ?opts] */
  onOff(enable, ...args) {
    (enable ? addEventListener : removeEventListener).apply(this, args);
  },
});

$.isTextInput = (el = {}) =>
  el.localName === 'textarea' ||
  el.localName === 'input' && /^(text|search|number)$/.test(el.type);

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
      if (btn.title && !btn.titleIsForEllipsis) {
        continue;
      }
      const width = btn.offsetWidth;
      if (!width || btn.preresizeClientWidth === width) {
        continue;
      }
      btn.preresizeClientWidth = width;
      if (btn.scrollWidth > width) {
        const text = btn.textContent;
        btn.title = text.includes('\u00AD') ? text.replace(/\u00AD/g, '') : text;
        btn.titleIsForEllipsis = true;
      } else if (btn.title) {
        btn.title = '';
      }
    }
  };
  // enqueue after DOMContentLoaded/load events
  setTimeout(addTooltipsToEllipsized, 500);
  // throttle on continuous resizing
  let timer;
  window.on('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(addTooltipsToEllipsized, 100);
  });
}

onDOMready().then(() => {
  $.remove('#firefox-transitions-bug-suppressor');
  initCollapsibles();
  focusAccessibility();
  if (!chrome.app && chrome.windows && typeof prefs !== 'undefined') {
    // add favicon in Firefox
    prefs.initializing.then(() => {
      const iconset = ['', 'light/'][prefs.get('iconset')] || '';
      for (const size of [38, 32, 19, 16]) {
        document.head.appendChild($create('link', {
          rel: 'icon',
          href: `/images/icon/${iconset}${size}.png`,
          sizes: size + 'x' + size,
        }));
      }
    });
  }
});

// set language for CSS :lang and [FF-only] hyphenation
document.documentElement.setAttribute('lang', chrome.i18n.getUILanguage());
// avoid adding # to the page URL when clicking dummy links
document.on('click', e => {
  if (e.target.closest('a[href="#"]')) {
    e.preventDefault();
  }
});
// update inputs on mousewheel when focused
document.on('wheel', event => {
  const el = document.activeElement;
  if (!el || el !== event.target && !el.contains(event.target)) {
    return;
  }
  const isSelect = el.tagName === 'SELECT';
  if (isSelect || el.tagName === 'INPUT' && el.type === 'range') {
    const key = isSelect ? 'selectedIndex' : 'valueAsNumber';
    const old = el[key];
    const rawVal = old + Math.sign(event.deltaY) * (el.step || 1);
    el[key] = Math.max(el.min || 0, Math.min(el.max || el.length - 1, rawVal));
    if (el[key] !== old) {
      el.dispatchEvent(new Event('change', {bubbles: true}));
    }
    event.preventDefault();
  }
  event.stopImmediatePropagation();
}, {
  capture: true,
  passive: false,
});

function onDOMready() {
  return document.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(resolve => document.on('DOMContentLoaded', resolve, {once: true}));
}


function scrollElementIntoView(element, {invalidMarginRatio = 0} = {}) {
  // align to the top/bottom of the visible area if wasn't visible
  if (!element.parentNode) return;
  const {top, height} = element.getBoundingClientRect();
  const {top: parentTop, bottom: parentBottom} = element.parentNode.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  if (top < Math.max(parentTop, windowHeight * invalidMarginRatio) ||
      top > Math.min(parentBottom, windowHeight) - height - windowHeight * invalidMarginRatio) {
    window.scrollBy(0, top - windowHeight / 2 + height);
  }
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
  element.on('change', onChange);
  element.on('input', onChange);
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
    delete opt.tag;
    children = opt.appendChild || properties;
    delete opt.appendChild;
  }

  if (tag && tag.includes(':')) {
    ([ns, tag] = tag.split(':'));
  }

  const element = ns
    ? document.createElementNS(ns === 'SVG' || ns === 'svg' ? 'http://www.w3.org/2000/svg' : ns, tag)
    : tag === 'fragment'
      ? document.createDocumentFragment()
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


// makes <details> with [data-pref] save/restore their state
function initCollapsibles({bindClickOn = 'h2'} = {}) {
  const prefMap = {};
  const elements = $$('details[data-pref]');
  if (!elements.length) {
    return;
  }

  for (const el of elements) {
    const key = el.dataset.pref;
    prefMap[key] = el;
    el.open = prefs.get(key);
    (bindClickOn && $(bindClickOn, el) || el).on('click', onClick);
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
    if (!el.matches('.compact-layout .ignore-pref-if-compact')) {
      prefs.set(el.dataset.pref, el.open);
    }
  }
}

// Makes the focus outline appear on keyboard tabbing, but not on mouse clicks.
function focusAccessibility() {
  // last event's focusedViaClick
  focusAccessibility.lastFocusedViaClick = false;
  // to avoid a full layout recalc due to changes on body/root
  // we modify the closest focusable element (like input or button or anything with tabindex=0)
  focusAccessibility.closest = el => {
    let labelSeen;
    for (; el; el = el.parentElement) {
      if (el.localName === 'label' && el.control && !labelSeen) {
        el = el.control;
        labelSeen = true;
      }
      if (el.tabIndex >= 0) return el;
    }
  };
  // suppress outline on click
  window.on('mousedown', ({target}) => {
    const el = focusAccessibility.closest(target);
    if (el) {
      focusAccessibility.lastFocusedViaClick = true;
      if (el.dataset.focusedViaClick === undefined) {
        el.dataset.focusedViaClick = '';
      }
    }
  }, {passive: true});
  // keep outline on Tab or Shift-Tab key
  window.on('keydown', event => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      focusAccessibility.lastFocusedViaClick = false;
      setTimeout(() => {
        let el = document.activeElement;
        if (el) {
          el = el.closest('[data-focused-via-click]');
          if (el) delete el.dataset.focusedViaClick;
        }
      });
    }
  }, {passive: true});
}

/**
 * Switches to the next/previous keyboard-focusable element
 * @param {HTMLElement} rootElement
 * @param {Number} step - for exmaple 1 or -1
 * @returns {HTMLElement|false|undefined} -
 *   HTMLElement: focus changed,
 *   false: focus unchanged,
 *   undefined: nothing to focus
 */
function moveFocus(rootElement, step) {
  const elements = [...rootElement.getElementsByTagName('*')];
  const activeIndex = Math.max(0, elements.indexOf(document.activeElement));
  const num = elements.length;
  const {activeElement} = document;
  for (let i = 1; i < num; i++) {
    const elementIndex = (activeIndex + i * step + num) % num;
    // we don't use positive tabindex so we stop at any valid value
    const el = elements[elementIndex];
    if (!el.disabled && el.tabIndex >= 0) {
      el.focus();
      return activeElement !== el && el;
    }
  }
}

// Accepts an array of pref names (values are fetched via prefs.get)
// and establishes a two-way connection between the document elements and the actual prefs
function setupLivePrefs(
  IDs = Object.getOwnPropertyNames(prefs.defaults)
    .filter(id => $('#' + id))
) {
  for (const id of IDs) {
    const element = $('#' + id);
    updateElement({id, element, force: true});
    element.on('change', onChange);
  }
  prefs.subscribe(IDs, (id, value) => updateElement({id, value}));

  function onChange() {
    const value = getInputValue(this);
    if (prefs.get(this.id) !== value) {
      prefs.set(this.id, value);
    }
  }
  function updateElement({
    id,
    value = prefs.get(id),
    element = $('#' + id),
    force,
  }) {
    if (!element) {
      prefs.unsubscribe(IDs, updateElement);
      return;
    }
    setInputValue(element, value, force);
  }
  function getInputValue(input) {
    if (input.type === 'checkbox') {
      return input.checked;
    }
    if (input.type === 'number') {
      return Number(input.value);
    }
    return input.value;
  }
  function setInputValue(input, value, force = false) {
    if (force || getInputValue(input) !== value) {
      if (input.type === 'checkbox') {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('change', {bubbles: true, cancelable: true}));
    }
  }
}
