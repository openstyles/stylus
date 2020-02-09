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
  const list = [];
  const table = new Map();
  let isEnabled = true;
  let isTransitionPatched;
  // will store the original method refs because the page can override them
  let creationDoc, createElement, createElementNS;
  return {
    // manipulation
    addMany,
    remove,
    clear,
    clearOrphans,
    replaceAll,

    // method
    toggle,
    sort,

    // state
    outOfOrder,
    list,

    // static util
    createStyle
  };

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
      const el = document.documentElement.appendChild(createStyle());
      const isApplied = el.sheet;
      el.remove();
      if (isApplied) return;
    }
    creationDoc = document;
    ({createElement, createElementNS} = document);
  }

  function outOfOrder() {
    if (!list.length) {
      return false;
    }
    let el = list[0].el;
    if (el.parentNode !== creationDoc.documentElement) {
      return true;
    }
    let i = 0;
    while (el) {
      if (i < list.length && el === list[i].el) {
        i++;
      } else if (ORDERED_TAGS.has(el.localName)) {
        return true;
      }
      el = el.nextElementSibling;
    }
    // some styles are not injected to the document
    return i < list.length;
  }

  function addMany(styles) {
    if (!isTransitionPatched) _applyTransitionPatch(styles);
    const els = styles.map(_add);
    onUpdate();
    return els;
  }

  function _add(style) {
    if (table.has(style.id)) {
      return _update(style);
    }
    const el = style.el = createStyle(style.id, style.code);
    table.set(style.id, style);
    const nextIndex = list.findIndex(i => compare(i, style) > 0);
    if (nextIndex < 0) {
      document.documentElement.appendChild(el);
      list.push(style);
    } else {
      document.documentElement.insertBefore(el, list[nextIndex].el);
      list.splice(nextIndex, 0, style);
    }
    // moving an element resets its 'disabled' state
    el.disabled = !isEnabled;
    return el;
  }

  // CSS transition bug workaround: since we insert styles asynchronously,
  // the browsers, especially Firefox, may apply all transitions on page load
  function _applyTransitionPatch(styles) {
    isTransitionPatched = document.readyState === 'complete';
    if (isTransitionPatched || !styles.some(s => s.code.includes('transition'))) {
      return;
    }
    const el = createStyle(PATCH_ID, `
      :root:not(#\\0):not(#\\0) * {
        transition: none !important;
      }
    `);
    document.documentElement.appendChild(el);
    // wait for the next paint to complete
    // note: requestAnimationFrame won't fire in inactive tabs
    requestAnimationFrame(() => setTimeout(() => el.remove()));
  }

  function remove(id) {
    _remove(id);
    onUpdate();
  }

  function _remove(id) {
    const style = table.get(id);
    if (!style) return;
    table.delete(id);
    list.splice(list.indexOf(style), 1);
    style.el.remove();
  }

  function _update({id, code}) {
    const style = table.get(id);
    if (style.code === code) return;
    style.code = code;
    // workaround for Chrome devtools bug fixed in v65
    if (isChromePre65) {
      const oldEl = style.el;
      style.el = createStyle(id, code);
      oldEl.parentNode.insertBefore(style.el, oldEl.nextSibling);
      oldEl.remove();
    } else {
      style.el.textContent = code;
    }
    // https://github.com/openstyles/stylus/issues/693
    style.el.disabled = !isEnabled;
  }

  function _supersede(domId) {
    const el = document.getElementById(domId);
    if (el) {
      // remove if it looks like our style that wasn't cleaned up in orphanCheck
      // (note, Firefox doesn't orphanize content scripts at all so orphanCheck will never run)
      if (el.localName === 'style' && el.classList.contains('stylus')) {
        el.remove();
      } else {
        el.id += ' superseded by Stylus';
      }
    }
  }

  function createStyle(id, code = '') {
    if (!creationDoc) _initCreationDoc();
    let el;
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
      _supersede(el.id);
    }
    el.type = 'text/css';
    // SVG className is not a string, but an instance of SVGAnimatedString
    el.classList.add('stylus');
    el.textContent = code;
    return el;
  }

  function clear() {
    for (const style of list) {
      style.el.remove();
    }
    list.length = 0;
    table.clear();
    onUpdate();
  }

  function clearOrphans() {
    for (const el of document.querySelectorAll(`style[id^="${PREFIX}-"].stylus`)) {
      const id = el.id.slice(PREFIX.length + 1);
      if (/^\d+$/.test(id) || id === PATCH_ID) {
        el.remove();
      }
    }
  }

  function toggle(_enabled) {
    if (isEnabled === _enabled) return;
    isEnabled = _enabled;
    for (const style of list) {
      style.el.disabled = !isEnabled;
    }
  }

  function sort() {
    list.sort(compare);
    for (const style of list) {
      // FIXME: do we need this?
      // const copy = document.importNode(el, true);
      // el.textContent += ' '; // invalidate CSSOM cache
      document.documentElement.appendChild(style.el);
      // moving an element resets its 'disabled' state
      style.el.disabled = !isEnabled;
    }
  }

  function replaceAll(styles) {
    const added = new Set(styles.map(s => s.id));
    const removed = [];
    for (const style of list) {
      if (!added.has(style.id)) {
        removed.push(style.id);
      }
    }
    styles.forEach(_add);
    removed.forEach(_remove);
    onUpdate();
  }
};
