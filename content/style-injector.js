/* global prefs */
'use strict';

self.createStyleInjector = self.INJECTED === 1 ? self.createStyleInjector : ({
  compare,
  onUpdate = () => {},
}) => {
  const PREFIX = 'stylus-';
  const PATCH_ID = 'transition-patch';
  // styles are out of order if any of these elements is injected between them
  const ORDERED_TAGS = new Set(['head', 'body', 'frameset', 'style', 'link']);
  // detect Chrome 65 via a feature it added since browser version can be spoofed
  const isChromePre65 = chrome.app && typeof Worklet !== 'function';
  const docRewriteObserver = RewriteObserver(_sort);
  const docRootObserver = RootObserver(_sortIfNeeded);
  const list = [];
  const table = new Map();
  let isEnabled = true;
  let isTransitionPatched;
  let ASS;
  // will store the original method refs because the page can override them
  let creationDoc, createElement, createElementNS;

  return {

    list,

    apply(styleMap) {
      if ('ASS' in styleMap) _init(styleMap);
      const styles = _styleMapToArray(styleMap);
      return (
        !styles.length ?
          Promise.resolve([]) :
          docRootObserver.evade(() => {
            if (!isTransitionPatched && isEnabled) {
              _applyTransitionPatch(styles);
            }
            return styles.map(_addUpdate);
          })
      ).then(_emitUpdate);
    },

    clear() {
      _addRemoveElements(false);
      list.length = 0;
      table.clear();
      _emitUpdate();
    },

    clearOrphans() {
      if (ASS) ASS.list = ASS.wipedList;
      for (const el of document.querySelectorAll(`style[id^="${PREFIX}"].stylus`)) {
        const id = el.id.slice(PREFIX.length);
        if (/^\d+$/.test(id) || id === PATCH_ID) {
          el.remove();
        }
      }
    },

    remove(id) {
      _remove(id);
      _emitUpdate();
    },

    replace(styleMap) {
      const styles = _styleMapToArray(styleMap);
      const added = new Set(styles.map(s => s.id));
      const removed = [];
      for (const style of list) {
        if (!added.has(style.id)) {
          removed.push(style.id);
        }
      }
      styles.forEach(_addUpdate);
      removed.forEach(_remove);
      _emitUpdate();
    },

    toggle(enable) {
      if (isEnabled === enable) return;
      isEnabled = enable;
      if (!enable) _toggleObservers(false);
      _addRemoveElements(enable);
      if (enable) _toggleObservers(true);
    },
  };

  function _add(style) {
    _domCreate(style);
    const i = list.findIndex(item => compare(item, style) > 0);
    table.set(style.id, style);
    if (isEnabled) _domInsert(style, (list[i] || {}).el);
    list.splice(i < 0 ? list.length : i, 0, style);
    return style.el;
  }

  function _addRemoveElements(add) {
    const asses = [];
    for (const style of list) {
      if (style.ass) {
        asses.push(style.el);
      } else if (add) {
        _domInsert(style);
      } else {
        _domDelete(style);
      }
    }
    if (ASS) {
      ASS.list = ASS.wipedList.concat(add ? asses : []);
    }
  }

  function _addUpdate(style) {
    return table.has(style.id) ? _update(style) : _add(style);
  }

  function _applyTransitionPatch(styles) {
    isTransitionPatched = true;
    // CSS transition bug workaround: since we insert styles asynchronously,
    // the browsers, especially Firefox, may apply all transitions on page load
    if (document.readyState === 'complete' ||
        document.visibilityState === 'hidden' ||
        !styles.some(s => s.code.includes('transition'))) {
      return;
    }
    const style = {
      id: PATCH_ID,
      code: `
        :root:not(#\\0):not(#\\0) * {
          transition: none !important;
        }
      `,
    };
    _domCreate(style);
    _domInsert(style);
    // wait for the next paint to complete
    // note: requestAnimationFrame won't fire in inactive tabs
    requestAnimationFrame(() => setTimeout(_domDelete, 0, style));
  }

  /**
   * @returns {Element|CSSStyleSheet}
   * @mutates style
   */
  function _domCreate(style = {}) {
    const {id, code = ''} = style;
    let el;
    if (ASS) {
      el = style.el = new CSSStyleSheet(id ? {media: PREFIX + id} : {});
      if (_setASSCode(style, code)) {
        return el;
      }
    }
    if (!creationDoc) _initCreationDoc();
    if (document.documentElement instanceof SVGSVGElement) {
      // SVG document style
      el = createElementNS.call(creationDoc, 'http://www.w3.org/2000/svg', 'style');
    } else if (document instanceof XMLDocument) {
      // XML document style
      el = createElementNS.call(creationDoc, 'http://www.w3.org/1999/xhtml', 'style');
    } else {
      // HTML document style; also works on HTML-embedded SVG
      el = createElement.call(creationDoc, 'style');
    }
    if (id) {
      el.id = `${PREFIX}${id}`;
      const oldEl = document.getElementById(el.id);
      if (oldEl) oldEl.id += '-superseded-by-Stylus';
    }
    el.type = 'text/css';
    // SVG className is not a string, but an instance of SVGAnimatedString
    el.classList.add('stylus');
    el.textContent = code;
    style.el = el;
    style.ass = false;
    return el;
  }

  function _domInsert({ass, el}, beforeEl) {
    if (ass) {
      const list = ASS.omit({el});
      const i = list.indexOf(beforeEl);
      list.splice(i >= 0 ? i : list.length, 0, el);
      ASS.list = list;
    } else {
      document.documentElement.insertBefore(el, beforeEl);
    }
  }

  function _domDelete({ass, el}) {
    if (ass) {
      ASS.omit({el, commit: true});
    } else {
      el.remove();
    }
  }

  function _setASSCode(style, code) {
    try {
      style.el.replaceSync(code); // throws on @import per spec
      style.ass = true;
    } catch (err) {
      style.ass = false;
    }
    const isTight = style.ass && list.every(s => s.ass);
    if (ASS.isTight !== isTight) {
      ASS.isTight = isTight;
      docRootObserver[isTight ? 'stop' : 'start']();
    }
    return style.ass;
  }

  function _toggleObservers(shouldStart) {
    const onOff = shouldStart && isEnabled ? 'start' : 'stop';
    docRewriteObserver[onOff]();
    docRootObserver[onOff]();
  }

  function _emitUpdate(value) {
    _toggleObservers(list.length);
    onUpdate();
    return value;
  }


  function _init(styleMap) {
    if (ASS == null && Array.isArray(document.adoptedStyleSheets)) {
      _initASS(styleMap.ASS);
      prefs.subscribe(['adoptedStyleSheets'], (key, value) => {
        _toggleObservers(false);
        _addRemoveElements(false);
        _initASS(value);
        list.forEach(_domCreate);
        if (isEnabled) _addRemoveElements(true);
        _toggleObservers(true);
      });
    }
    delete styleMap.ASS;
  }

  function _initASS(enable) {
    if (ASS && !enable) {
      ASS = false;
    } else if (!ASS && enable) {
      ASS = {
        isTight: true,
        /** @param {CSSStyleSheet[]} sheets */
        set list(sheets) {
          document.adoptedStyleSheets = sheets;
        },
        /** @returns {CSSStyleSheet[]} */
        get list() {
          return [...document.adoptedStyleSheets];
        },
        /** @returns {CSSStyleSheet[]} without our elements */
        get wipedList() {
          return ASS.list.filter(({media: {0: id = ''}}) =>
            !(id.startsWith(PREFIX) && Number(id.slice(PREFIX.length)) || id.endsWith(PATCH_ID)));
        },
        omit({el, list = ASS.list, commit}) {
          const i = list.indexOf(el);
          if (i >= 0) list.splice(i, 1);
          if (commit) ASS.list = list;
          return list;
        },
      };
    }
  }

  /*
  FF59+ workaround: allow the page to read our sheets, https://github.com/openstyles/stylus/issues/461
  First we're trying the page context document where inline styles may be forbidden by CSP
  https://bugzilla.mozilla.org/show_bug.cgi?id=1579345#c3
  and since userAgent.navigator can be spoofed via about:config or devtools,
  we're checking for getPreventDefault that was removed in FF59
  */
  function _initCreationDoc() {
    creationDoc = !Event.prototype.getPreventDefault && document.wrappedJSObject;
    if (creationDoc) {
      ({createElement, createElementNS} = creationDoc);
      const el = document.documentElement.appendChild(_domCreate());
      const isApplied = el.sheet;
      el.remove();
      if (isApplied) return;
    }
    creationDoc = document;
    ({createElement, createElementNS} = document);
  }

  function _remove(id) {
    const style = table.get(id);
    if (!style) return;
    table.delete(id);
    list.splice(list.indexOf(style), 1);
    _domDelete(style);
  }

  function _sort() {
    docRootObserver.evade(() => {
      list.sort(compare);
      _addRemoveElements(true);
    });
  }

  function _sortIfNeeded() {
    let needsSort;
    let el = list.length && list[0].el;
    if (!el) {
      needsSort = false;
    } else if (el.parentNode !== creationDoc.documentElement) {
      needsSort = true;
    } else {
      let i = 0;
      while (el) {
        if (i < list.length && el === list[i].el) {
          i++;
        } else if (ORDERED_TAGS.has(el.localName)) {
          needsSort = true;
          break;
        }
        el = el.nextElementSibling;
      }
      // some styles are not injected to the document
      if (i < list.length) needsSort = true;
    }
    if (needsSort) _sort();
    return needsSort;
  }

  function _styleMapToArray(styleMap) {
    return Object.values(styleMap).map(s => ({
      id: s.id,
      code: s.code.join(''),
    }));
  }

  function _update({id, code}) {
    const style = table.get(id);
    if (style.code === code) return;
    style.code = code;
    // workaround for Chrome devtools bug fixed in v65
    if (isChromePre65) {
      const oldEl = style.el;
      style.el = _domCreate({id, code});
      if (isEnabled) {
        oldEl.parentNode.insertBefore(style.el, oldEl.nextSibling);
        oldEl.remove();
      }
    } else if (!style.ass) {
      style.el.textContent = code;
    } else if (!_setASSCode(style, code)) {
      _remove(id);
      _add(style);
    }
  }

  function RewriteObserver(onChange) {
    // detect documentElement being rewritten from inside the script
    let root;
    let observing = false;
    let timer;
    const observer = new MutationObserver(_check);
    return {start, stop};

    function start() {
      if (observing) return;
      // detect dynamic iframes rewritten after creation by the embedder i.e. externally
      root = document.documentElement;
      timer = setTimeout(_check);
      observer.observe(document, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      clearTimeout(timer);
      observer.disconnect();
      observing = false;
    }

    function _check() {
      if (root !== document.documentElement) {
        root = document.documentElement;
        onChange();
      }
    }
  }

  function RootObserver(onChange) {
    let digest = 0;
    let lastCalledTime = NaN;
    let observing = false;
    let observer;
    return {evade, start, stop};

    function create() {
      observer = new MutationObserver(() => {
        if (digest) {
          if (performance.now() - lastCalledTime > 1000) {
            digest = 0;
          } else if (digest > 5) {
            throw new Error('The page keeps generating mutations. Skip the event.');
          }
        }
        if (onChange()) {
          digest++;
          lastCalledTime = performance.now();
        }
      });
    }

    function evade(fn) {
      const restore = observing && start;
      stop();
      return new Promise(resolve => _run(fn, resolve, _waitForRoot))
        .then(restore);
    }

    function start() {
      if (observing || ASS && ASS.isTight) return;
      if (!observer) create();
      observer.observe(document.documentElement, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      // FIXME: do we need this?
      observer.takeRecords();
      observer.disconnect();
      observing = false;
    }

    function _run(fn, resolve, wait) {
      if (document.documentElement) {
        resolve(fn());
        return true;
      }
      if (wait) wait(fn, resolve);
    }

    function _waitForRoot(...args) {
      new MutationObserver((_, observer) => _run(...args) && observer.disconnect())
        .observe(document, {childList: true});
    }
  }
};
