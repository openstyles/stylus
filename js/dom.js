'use strict';

define(require => {

  Object.assign(EventTarget.prototype, {
    on: addEventListener,
    off: removeEventListener,
  });

  /** @type {Prefs} */
  let prefs;

  //#region Exports

  /** @type {DOM} */
  let dom;
  const {

    $,
    $$,
    $create,

  } = dom = /** @namespace DOM */ {

    $(selector, base = document) {
      // we have ids with . like #manage.onlyEnabled which looks like #id.class
      // so since getElementById is superfast we'll try it anyway
      const byId = selector.startsWith('#') && document.getElementById(selector.slice(1));
      return byId || base.querySelector(selector);
    },

    $$(selector, base = document) {
      return [...base.querySelectorAll(selector)];
    },

    $isTextInput(el = {}) {
      return el.localName === 'textarea' ||
        el.localName === 'input' && /^(text|search|number)$/.test(el.type);
    },

    $remove(selector, base = document) {
      const el = selector && typeof selector === 'string' ? $(selector, base) : selector;
      if (el) {
        el.remove();
      }
    },

    $$remove(selector, base = document) {
      for (const el of base.querySelectorAll(selector)) {
        el.remove();
      }
    },

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
    $create(selector = 'div', properties, children) {
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
    },

    $createLink(href = '', content) {
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
      return dom.$create(opt);
    },

    /**
     * @param {HTMLElement} el
     * @param {string} [cls] - class name that defines or starts an animation
     * @param [removeExtraClasses] - class names to remove at animation end in the *same* paint frame,
     *        which is needed in e.g. Firefox as it may call resolve() in the next frame
     * @returns {Promise<void>}
     */
    animateElement(el, cls = 'highlight', ...removeExtraClasses) {
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
    },

    // Makes the focus outline appear on keyboard tabbing, but not on mouse clicks.
    focusAccessibility: {
      // last event's focusedViaClick
      lastFocusedViaClick: false,
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
    },

    getEventKeyName(e, letterAsCode) {
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
          : 'LMR'[e.button]
      }`;
    },

    /** @type {MessageBox} however properties are resolved asynchronously! */
    messageBoxProxy: new Proxy({}, {
      get(_, name) {
        return async (...args) => (await require(['/js/dlg/message-box']))[name](...args);
      },
    }),

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
    moveFocus(rootElement, step) {
      const elements = [...rootElement.getElementsByTagName('*')];
      const activeEl = document.activeElement;
      const activeIndex = step ? Math.max(step < 0 ? 0 : -1, elements.indexOf(activeEl)) : -1;
      const num = elements.length;
      if (!step) step = 1;
      for (let i = 1; i < num; i++) {
        const el = elements[(activeIndex + i * step + num) % num];
        if (!el.disabled && el.tabIndex >= 0) {
          el.focus();
          return activeEl !== el && el;
        }
      }
    },

    onDOMready() {
      return document.readyState !== 'loading'
        ? Promise.resolve()
        : new Promise(resolve => document.on('DOMContentLoaded', resolve, {once: true}));
    },

    scrollElementIntoView(element, {invalidMarginRatio = 0} = {}) {
      // align to the top/bottom of the visible area if wasn't visible
      if (!element.parentNode) return;
      const {top, height} = element.getBoundingClientRect();
      const {top: parentTop, bottom: parentBottom} = element.parentNode.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      if (top < Math.max(parentTop, windowHeight * invalidMarginRatio) ||
          top > Math.min(parentBottom, windowHeight) - height - windowHeight * invalidMarginRatio) {
        window.scrollBy(0, top - windowHeight / 2 + height);
      }
    },

    /**
     * Accepts an array of pref names (values are fetched via prefs.get)
     * and establishes a two-way connection between the document elements and the actual prefs
     */
    setupLivePrefs(ids = Object.keys(prefs.defaults).filter(id => $('#' + id))) {
      let forceUpdate = true;
      prefs.subscribe(ids, updateElement, {runNow: true});
      forceUpdate = false;
      ids.forEach(id => $('#' + id).on('change', onChange));

      function onChange() {
        prefs.set(this.id, this[getPropName(this)]);
      }

      function getPropName(el) {
        return el.type === 'checkbox' ? 'checked'
          : el.type === 'number' ? 'valueAsNumber' :
            'value';
      }

      function updateElement(id, value) {
        const el = $('#' + id);
        if (el) {
          const prop = getPropName(el);
          if (el[prop] !== value || forceUpdate) {
            el[prop] = value;
            el.dispatchEvent(new Event('change', {bubbles: true}));
          }
        } else {
          prefs.unsubscribe(ids, updateElement);
        }
      }
    },

    // Accepts an array of pref names (values are fetched via prefs.get)
    // and establishes a two-way connection between the document elements and the actual prefs
    waitForSelector(selector, {stopOnDomReady = true} = {}) {
      // TODO: if used concurrently see if it's worth reworking to use just one observer internally
      return Promise.resolve($(selector) || new Promise(resolve => {
        const mo = new MutationObserver(() => {
          const el = $(selector);
          if (el) {
            mo.disconnect();
            resolve(el);
          } else if (stopOnDomReady && document.readyState === 'complete') {
            mo.disconnect();
          }
        });
        mo.observe(document, {childList: true, subtree: true});
      }));
    },
  };

  //#endregion
  //#region Init

  require(['/js/prefs'], p => {
    prefs = p;
    dom.waitForSelector('details[data-pref]')
      .then(() => requestAnimationFrame(initCollapsibles));
    if (!chrome.app) {
      // add favicon in Firefox
      const iconset = ['', 'light/'][prefs.get('iconset')] || '';
      for (const size of [38, 32, 19, 16]) {
        document.head.appendChild($create('link', {
          rel: 'icon',
          href: `/images/icon/${iconset}${size}.png`,
          sizes: size + 'x' + size,
        }));
      }
    }
  });

  require(['/js/toolbox'], m => {
    m.debounce(addTooltipsToEllipsized, 500);
    window.on('resize', () => m.debounce(addTooltipsToEllipsized, 100));
  });

  window.on('mousedown', suppressFocusRingOnClick, {passive: true});
  window.on('keydown', keepFocusRingOnTabbing, {passive: true});

  dom.onDOMready().then(() => {
    dom.$remove('#firefox-transitions-bug-suppressor');
  });
  if (!/^Win\d+/.test(navigator.platform)) {
    document.documentElement.classList.add('non-windows');
  }
  // set language for a) CSS :lang pseudo and b) hyphenation
  document.documentElement.setAttribute('lang', chrome.i18n.getUILanguage());
  document.on('click', keepAddressOnDummyClick);
  document.on('wheel', changeFocusedInputOnWheel, {capture: true, passive: false});

  //#endregion
  //#region Internals

  function changeFocusedInputOnWheel(event) {
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
  }

  /** Displays a full text tooltip on buttons with ellipsis overflow and no inherent title */
  function addTooltipsToEllipsized() {
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
  }

  // makes <details> with [data-pref] save/restore their state
  function initCollapsibles() {
    const onClick = async event => {
      if (event.target.closest('.intercepts-click')) {
        event.preventDefault();
      } else {
        const el = event.target.closest('details');
        await new Promise(setTimeout);
        if (!el.matches('.compact-layout .ignore-pref-if-compact')) {
          prefs.set(el.dataset.pref, el.open);
        }
      }
    };
    const prefMap = {};
    for (const el of $$('details[data-pref]')) {
      prefMap[el.dataset.pref] = el;
      ($('h2', el) || el).on('click', onClick);
    }
    prefs.subscribe(Object.keys(prefMap), (key, value) => {
      const el = prefMap[key];
      if (el.open !== value && !el.matches('.compact-layout .ignore-pref-if-compact')) {
        el.open = value;
      }
    }, {runNow: true});
  }

  function keepAddressOnDummyClick(e) {
    // avoid adding # to the page URL when clicking dummy links
    if (e.target.closest('a[href="#"]')) {
      e.preventDefault();
    }
  }

  function keepFocusRingOnTabbing(event) {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      dom.focusAccessibility.lastFocusedViaClick = false;
      setTimeout(() => {
        let el = document.activeElement;
        if (el) {
          el = el.closest('[data-focused-via-click]');
          if (el) delete el.dataset.focusedViaClick;
        }
      });
    }
  }

  function suppressFocusRingOnClick({target}) {
    const el = dom.focusAccessibility.closest(target);
    if (el) {
      dom.focusAccessibility.lastFocusedViaClick = true;
      if (el.dataset.focusedViaClick === undefined) {
        el.dataset.focusedViaClick = '';
      }
    }
  }

  //#endregion

  return dom;
});
