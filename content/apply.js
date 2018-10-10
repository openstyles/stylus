/* eslint no-var: 0 */
/* global msg */
'use strict';

(() => {
  if (typeof window.applyOnMessage === 'function') {
    // some weird bug in new Chrome: the content script gets injected multiple times
    return;
  }
  const CHROME = chrome.app ? parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) : NaN;
  var ID_PREFIX = 'stylus-';
  var ROOT = document.documentElement;
  var isOwnPage = location.protocol.endsWith('-extension:');
  var disableAll = false;
  var exposeIframes = false;
  var styleElements = new Map();
  var disabledElements = new Map();
  var retiredStyleTimers = new Map();
  var docRewriteObserver;
  var docRootObserver;

  // FF59+ bug workaround
  // See https://github.com/openstyles/stylus/issues/461
  // Since it's easy to spoof the browser version in pre-Quantum FF we're checking
  // for getPreventDefault which got removed in FF59 https://bugzil.la/691151
  const FF_BUG461 = !CHROME && !isOwnPage && !Event.prototype.getPreventDefault;
  const pageContextQueue = [];

  // FIXME: styleViaAPI
  // FIXME: getStylesFallback?
  if (!chrome.app && document instanceof XMLDocument) {
    API.styleViaAPI({action: 'styleApply'});
  } else {
    API.getSectionsByUrl(getMatchUrl(), {enabled: true})
      .then(result => {
        const styles = Object.values(result);
        if (styles.some(s => s.code.includes('transition'))) {
          applyTransitionPatch();
        }
        applyStyles(styles);
      });
  }
  msg.onTab(applyOnMessage);
  window.applyOnMessage = applyOnMessage;

  if (!isOwnPage) {
    window.dispatchEvent(new CustomEvent(chrome.runtime.id));
    window.addEventListener(chrome.runtime.id, orphanCheck, true);
  }

  // FIXME: does it work with styleViaAPI?
  prefs.subscribe(['disableAll'], (key, value) => doDisableAll(value));
  prefs.subscribe(['exposeIframes'], (key, value) => doExposeIframes(value));

  function getMatchUrl() {
    var matchUrl = location.href;
    if (!matchUrl.match(/^(http|file|chrome|ftp)/)) {
      // dynamic about: and javascript: iframes don't have an URL yet
      // so we'll try the parent frame which is guaranteed to have a real URL
      try {
        if (window !== parent) {
          matchUrl = parent.location.href;
        }
      } catch (e) {}
    }
    return matchUrl;
  }

  function buildSections(cache) {
    return Object.values(cache);
  }

  /**
   * TODO: remove when FF fixes the bug.
   * Firefox borks sendMessage in same-origin iframes that have 'src' with a real path on the site.
   * We implement a workaround for the initial styleApply case only.
   * Everything else (like toggling of styles) is still buggy.
   * @param {Object} msg
   * @param {Function} callback
   * @returns {Boolean|undefined}
   */
  function getStylesFallback(msg) {
    if (window !== parent &&
        location.href !== 'about:blank') {
      try {
        if (parent.location.origin === location.origin &&
            parent.location.href !== location.href) {
          chrome.runtime.connect({name: 'getStyles:' + JSON.stringify(msg)});
          return true;
        }
      } catch (e) {}
    }
  }

  function applyOnMessage(request) {
    if (!chrome.app && document instanceof XMLDocument && request.method !== 'ping') {
      request.action = request.method;
      request.method = null;
      request.styles = null;
      if (request.style) {
        request.style.sections = null;
      }
      API.styleViaAPI(request);
      return;
    }

    switch (request.method) {
      case 'styleDeleted':
        removeStyle(request.style);
        break;

      case 'styleUpdated':
        if (request.codeIsUpdated === false) {
          applyStyleState(request.style);
        } else if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), {id: request.style.id})
            .then(sections => {
              if (!sections[request.style.id]) {
                removeStyle(request.style);
              } else {
                applyStyles(buildSections(sections));
              }
            });
        } else {
          removeStyle(request.style);
        }
        break;

      case 'styleAdded':
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), {id: request.style.id})
            .then(buildSections)
            .then(applyStyles);
        }
        break;

      case 'styleApply':
        applyStyles(request.styles);
        break;

      case 'urlChanged':
        API.getSectionsByUrl(getMatchUrl(), {enabled: true})
          .then(buildSections)
          .then(replaceAll);
        break;

      case 'ping':
        return true;
    }
  }

  function doDisableAll(disable = disableAll) {
    if (!disable === !disableAll) {
      return;
    }
    disableAll = disable;
    Array.prototype.forEach.call(document.styleSheets, stylesheet => {
      if (stylesheet.ownerNode.matches(`style.stylus[id^="${ID_PREFIX}"]`)
      && stylesheet.disabled !== disable) {
        stylesheet.disabled = disable;
      }
    });
  }

  function doExposeIframes(state = exposeIframes) {
    if (state === exposeIframes ||
        state === true && typeof exposeIframes === 'string' ||
        window === parent) {
      return;
    }
    exposeIframes = state;
    const attr = document.documentElement.getAttribute('stylus-iframe');
    if (state && state !== attr) {
      document.documentElement.setAttribute('stylus-iframe', state);
    } else if (!state && attr !== undefined) {
      document.documentElement.removeAttribute('stylus-iframe');
    }
  }

  function applyStyleState({id, enabled}) {
    const inCache = disabledElements.get(id) || styleElements.get(id);
    const inDoc = document.getElementById(ID_PREFIX + id);
    if (enabled) {
      if (inDoc) {
        return;
      } else if (inCache) {
        addStyleElement(inCache);
        disabledElements.delete(id);
      } else {
        API.getSectionsByUrl(getMatchUrl(), {id})
          .then(buildSections)
          .then(applyStyles);
      }
    } else {
      if (inDoc) {
        disabledElements.set(id, inDoc);
        docRootObserver.evade(() => inDoc.remove());
      }
    }
  }

  function removeStyle({id, retire = false}) {
    const el = document.getElementById(ID_PREFIX + id);
    if (el) {
      if (retire) {
        // to avoid page flicker when the style is updated
        // instead of removing it immediately we rename its ID and queue it
        // to be deleted in applyStyles after a new version is fetched and applied
        const deadID = id + '-ghost';
        el.id = ID_PREFIX + deadID;
        // in case something went wrong and new style was never applied
        retiredStyleTimers.set(deadID, setTimeout(removeStyle, 1000, {id: deadID}));
      } else {
        docRootObserver.evade(() => el.remove());
      }
    }
    styleElements.delete(ID_PREFIX + id);
    disabledElements.delete(id);
    retiredStyleTimers.delete(id);
  }

  function applyStyles(styles) {
    // if (!styles) {
      // Chrome is starting up
      // requestStyles();
      // return;
    // }

    if (!document.documentElement) {
      new MutationObserver((mutations, observer) => {
        if (document.documentElement) {
          observer.disconnect();
          applyStyles(styles);
        }
      }).observe(document, {childList: true});
      return;
    }

    // FIXME: switch to prefs
    // if ('disableAll' in styles) {
      // doDisableAll(styles.disableAll);
    // }
    // if ('exposeIframes' in styles) {
      // doExposeIframes(styles.exposeIframes);
    // }

    const gotNewStyles = styles.length || styles.needTransitionPatch;
    if (gotNewStyles) {
      if (docRootObserver) {
        docRootObserver.stop();
      } else {
        initDocRootObserver();
      }
    }

    if (gotNewStyles) {
      for (const section of styles) {
        applySections(section.id, section.code);
      }
      docRootObserver.firstStart();
    }

    // FIXME
    // if (FF_BUG461 && (gotNewStyles || styles.needTransitionPatch)) {
      // setContentsInPageContext();
    // }

    if (!isOwnPage && !docRewriteObserver && styleElements.size) {
      initDocRewriteObserver();
    }

    if (retiredStyleTimers.size) {
      setTimeout(() => {
        for (const [id, timer] of retiredStyleTimers.entries()) {
          removeStyle({id});
          clearTimeout(timer);
        }
      });
    }
  }

  function applySections(styleId, code) {
    const id = ID_PREFIX + styleId;
    let el = styleElements.get(id) || document.getElementById(id);
    if (el && el.textContent !== code) {
      if (CHROME < 3321) {
        // workaround for Chrome devtools bug fixed in v65
        el.remove();
        el = null;
      } else if (FF_BUG461) {
        pageContextQueue.push({id: el.id, el, code});
      } else {
        el.textContent = code;
      }
    }
    if (!el) {
      if (document.documentElement instanceof SVGSVGElement) {
        // SVG document style
        el = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      } else if (document instanceof XMLDocument) {
        // XML document style
        el = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
      } else {
        // HTML document style; also works on HTML-embedded SVG
        el = document.createElement('style');
      }
      el.id = id;
      el.type = 'text/css';
      // SVG className is not a string, but an instance of SVGAnimatedString
      el.classList.add('stylus');
      if (FF_BUG461) {
        pageContextQueue.push({id: el.id, el, code});
      } else {
        el.textContent = code;
      }
      addStyleElement(el);
    }
    styleElements.set(id, el);
    disabledElements.delete(Number(styleId));
    return el;
  }

  function setContentsInPageContext() {
    try {
      (document.head || ROOT).appendChild(document.createElement('script')).text = `(${queue => {
        document.currentScript.remove();
        for (const {id, code} of queue) {
          const el = document.getElementById(id) ||
                     document.querySelector('style.stylus[id="' + id + '"]');
          if (!el) continue;
          const {disabled} = el.sheet;
          el.textContent = code;
          el.sheet.disabled = disabled;
        }
      }})(${JSON.stringify(pageContextQueue)})`;
    } catch (e) {}
    let failedSome;
    for (const {el, code} of pageContextQueue) {
      if (el.textContent !== code) {
        el.textContent = code;
        failedSome = true;
      }
    }
    if (failedSome) {
      console.debug('Could not set code of some styles in page context, ' +
                    'see https://github.com/openstyles/stylus/issues/461');
    }
    pageContextQueue.length = 0;
  }

  function addStyleElement(newElement) {
    if (!ROOT) {
      return;
    }
    let next;
    const newStyleId = getStyleId(newElement);
    for (const el of styleElements.values()) {
      if (el.parentNode && !el.id.endsWith('-ghost') && getStyleId(el) > newStyleId) {
        next = el.parentNode === ROOT ? el : null;
        break;
      }
    }
    if (next === newElement.nextElementSibling) {
      return;
    }
    const insert = () => {
      ROOT.insertBefore(newElement, next || null);
      if (disableAll) {
        newElement.disabled = true;
      }
    };
    if (docRootObserver) {
      docRootObserver.evade(insert);
    } else {
      insert();
    }
  }

  function replaceAll(newStyles) {
    const oldStyles = Array.prototype.slice.call(
      document.querySelectorAll(`style.stylus[id^="${ID_PREFIX}"]`));
    oldStyles.forEach(el => (el.id += '-ghost'));
    styleElements.clear();
    disabledElements.clear();
    [...retiredStyleTimers.values()].forEach(clearTimeout);
    retiredStyleTimers.clear();
    applyStyles(newStyles);
    if (docRewriteObserver) {
      docRootObserver.evade(() =>
        oldStyles.forEach(el => el.remove()));
    }
  }

  function applyTransitionPatch() {
    // CSS transition bug workaround: since we insert styles asynchronously,
    // the browsers, especially Firefox, may apply all transitions on page load
    const className = chrome.runtime.id + '-transition-bug-fix';
    const docId = document.documentElement.id ? '#' + document.documentElement.id : '';
    document.documentElement.classList.add(className);
    applySections(0, `
        ${docId}.${className}:root * {
          transition: none !important;
        }
      `);
    setTimeout(() => {
      removeStyle({id: 0});
      document.documentElement.classList.remove(className);
    });
  }

  function getStyleId(el) {
    return parseInt(el.id.substr(ID_PREFIX.length));
  }

  function countStylesInHash(styleHash) {
    let num = 0;
    for (const k in styleHash) {
      num += !isNaN(parseInt(k)) ? 1 : 0;
    }
    return num;
  }

  function orphanCheck() {
    if (chrome.i18n && chrome.i18n.getUILanguage()) {
      return true;
    }
    // In Chrome content script is orphaned on an extension update/reload
    // so we need to detach event listeners
    [docRewriteObserver, docRootObserver].forEach(ob => ob && ob.disconnect());
    window.removeEventListener(chrome.runtime.id, orphanCheck, true);
    try {
      msg.off(applyOnMessage);
    } catch (e) {}
  }

  function initDocRewriteObserver() {
    // detect documentElement being rewritten from inside the script
    docRewriteObserver = new MutationObserver(mutations => {
      for (let m = mutations.length; --m >= 0;) {
        const added = mutations[m].addedNodes;
        for (let n = added.length; --n >= 0;) {
          if (added[n].localName === 'html') {
            reinjectStyles();
            return;
          }
        }
      }
    });
    docRewriteObserver.observe(document, {childList: true});
    // detect dynamic iframes rewritten after creation by the embedder i.e. externally
    setTimeout(() => {
      if (document.documentElement !== ROOT) {
        reinjectStyles();
      }
    });
    // re-add styles if we detect documentElement being recreated
    function reinjectStyles() {
      if (!styleElements) {
        orphanCheck();
        return;
      }
      ROOT = document.documentElement;
      docRootObserver.stop();
      const imported = [];
      for (const [id, el] of styleElements.entries()) {
        const copy = document.importNode(el, true);
        el.textContent += ' '; // invalidate CSSOM cache
        imported.push([id, copy]);
        addStyleElement(copy);
      }
      docRootObserver.start();
      styleElements = new Map(imported);
    }
  }

  function initDocRootObserver() {
    let lastRestorationTime = 0;
    let restorationCounter = 0;
    let observing = false;
    let sorting = false;
    let observer;
    // allow any types of elements between ours, except for the following:
    const ORDERED_TAGS = ['head', 'body', 'frameset', 'style', 'link'];

    init();
    return;

    function init() {
      observer = new MutationObserver(sortStyleElements);
      docRootObserver = {firstStart, start, stop, evade, disconnect: stop};
      setTimeout(sortStyleElements);
    }
    function firstStart() {
      if (sortStyleMap()) {
        sortStyleElements();
      }
      start();
    }
    function start() {
      if (!observing && ROOT && observer) {
        observer.observe(ROOT, {childList: true});
        observing = true;
      }
    }
    function stop() {
      if (observing) {
        observer.takeRecords();
        observer.disconnect();
        observing = false;
      }
    }
    function evade(fn) {
      const wasObserving = observing;
      if (observing) {
        stop();
      }
      fn();
      if (wasObserving) {
        start();
      }
    }
    function sortStyleMap() {
      const list = [];
      let prevStyleId = 0;
      let needsSorting = false;
      for (const entry of styleElements.entries()) {
        list.push(entry);
        const el = entry[1];
        const styleId = getStyleId(el);
        el.styleId = styleId;
        needsSorting |= styleId < prevStyleId;
        prevStyleId = styleId;
      }
      if (needsSorting) {
        styleElements = new Map(list.sort((a, b) => a[1].styleId - b[1].styleId));
        return true;
      }
    }
    function sortStyleElements() {
      if (!observing) return;
      let prevExpected = document.documentElement.lastElementChild;
      while (prevExpected && isSkippable(prevExpected, true)) {
        prevExpected = prevExpected.previousElementSibling;
      }
      if (!prevExpected) return;
      for (const el of styleElements.values()) {
        if (!isMovable(el)) {
          continue;
        }
        while (true) {
          const next = prevExpected.nextElementSibling;
          if (next && isSkippable(next)) {
            prevExpected = next;
          } else if (
              next === el ||
              next === el.previousElementSibling && next ||
              moveAfter(el, next || prevExpected)) {
            prevExpected = el;
            break;
          } else {
            return;
          }
        }
      }
      if (sorting) {
        sorting = false;
        if (observer) observer.takeRecords();
        if (!restorationLimitExceeded()) {
          start();
        } else {
          setTimeout(start, 1000);
        }
      }
    }
    function isMovable(el) {
      return el.parentNode || !disabledElements.has(getStyleId(el));
    }
    function isSkippable(el, skipOwnStyles) {
      return !ORDERED_TAGS.includes(el.localName) ||
        el.id.startsWith(ID_PREFIX) &&
        (skipOwnStyles || el.id.endsWith('-ghost')) &&
        el.localName === 'style' &&
        el.className === 'stylus';
    }
    function moveAfter(el, expected) {
      if (!sorting) {
        sorting = true;
        stop();
      }
      expected.insertAdjacentElement('afterend', el);
      if (el.disabled !== disableAll) {
        // moving an element resets its 'disabled' state
        el.disabled = disableAll;
      }
      return true;
    }
    function restorationLimitExceeded() {
      const t = performance.now();
      if (t - lastRestorationTime > 1000) {
        restorationCounter = 0;
      }
      lastRestorationTime = t;
      return ++restorationCounter > 5;
    }
  }
})();
