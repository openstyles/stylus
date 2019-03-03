/* eslint no-var: 0 */
/* global msg API prefs */
/* exported APPLY */
'use strict';

// some weird bug in new Chrome: the content script gets injected multiple times
// define a constant so it throws when redefined
const APPLY = (() => {
  const CHROME = chrome.app ? parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) : NaN;
  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  var ID_PREFIX = 'stylus-';
  var ROOT;
  var isOwnPage = location.protocol.endsWith('-extension:');
  var disableAll = false;
  var styleElements = new Map();
  var disabledElements = new Map();
  var docRewriteObserver;
  var docRootObserver;
  const setStyleContent = createSetStyleContent();
  const initializing = init();

  msg.onTab(applyOnMessage);

  if (!isOwnPage) {
    window.dispatchEvent(new CustomEvent(chrome.runtime.id, {
      detail: pageObject({method: 'orphan'})
    }));
    window.addEventListener(chrome.runtime.id, orphanCheck, true);
  }

  let parentDomain;

  prefs.subscribe(['disableAll'], (key, value) => doDisableAll(value));
  if (window !== parent) {
    prefs.subscribe(['exposeIframes'], updateExposeIframes);
  }

  function init() {
    if (STYLE_VIA_API) {
      return API.styleViaAPI({method: 'styleApply'});
    }
    return API.getSectionsByUrl(getMatchUrl())
      .then(result => {
        ROOT = document.documentElement;
        applyStyles(result, () => {
          // CSS transition bug workaround: since we insert styles asynchronously,
          // the browsers, especially Firefox, may apply all transitions on page load
          if ([...styleElements.values()].some(n => n.textContent.includes('transition'))) {
            applyTransitionPatch();
          }
        });
      });
  }

  function pageObject(target) {
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts
    const obj = new window.Object();
    Object.assign(obj, target);
    return obj;
  }

  function createSetStyleContent() {
    // FF59+ bug workaround
    // See https://github.com/openstyles/stylus/issues/461
    // Since it's easy to spoof the browser version in pre-Quantum FF we're checking
    // for getPreventDefault which got removed in FF59 https://bugzil.la/691151
    const EVENT_NAME = chrome.runtime.id;
    let ready;
    return (el, content) =>
      checkPageScript().then(ok => {
        if (!ok) {
          const disabled = el.disabled;
          el.textContent = content;
          el.disabled = disabled;
        } else {
          const detail = pageObject({
            method: 'setStyleContent',
            id: el.id,
            content
          });
          window.dispatchEvent(new CustomEvent(EVENT_NAME, {detail}));
        }
      });

    function checkPageScript() {
      if (!ready) {
        ready = CHROME || isOwnPage || Event.prototype.getPreventDefault ?
          Promise.resolve(false) : injectPageScript();
      }
      return ready;
    }

    function injectPageScript() {
      const scriptContent = EVENT_NAME => {
        document.currentScript.remove();
        const available = checkStyleApplied();
        if (available) {
          window.addEventListener(EVENT_NAME, function handler(e) {
            const {method, id, content} = e.detail;
            if (method === 'setStyleContent') {
              const el = document.getElementById(id);
              if (!el) {
                return;
              }
              const disabled = el.disabled;
              el.textContent = content;
              el.disabled = disabled;
            } else if (method === 'orphan') {
              window.removeEventListener(EVENT_NAME, handler);
            }
          }, true);
        }
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {detail: {
          method: 'init',
          available
        }}));

        function checkStyleApplied() {
          const style = document.createElement('style');
          style.textContent = ':root{--stylus-applied:1}';
          document.documentElement.appendChild(style);
          const applied = getComputedStyle(document.documentElement)
            .getPropertyValue('--stylus-applied');
          style.remove();
          return Boolean(applied);
        }
      };
      const code = `(${scriptContent})(${JSON.stringify(EVENT_NAME)})`;
      const src = `data:application/javascript;base64,${btoa(code)}`;
      const script = document.createElement('script');
      const {resolve, promise} = deferred();
      script.src = src;
      script.onerror = resolveFalse;
      window.addEventListener('error', resolveFalse);
      window.addEventListener(EVENT_NAME, handleInit);
      (document.head || document.documentElement).appendChild(script);
      return promise.then(result => {
        script.remove();
        window.removeEventListener(EVENT_NAME, handleInit);
        window.removeEventListener('error', resolveFalse);
        return result;
      });

      function resolveFalse() {
        resolve(false);
      }

      function handleInit(e) {
        if (e.detail.method === 'init') {
          resolve(e.detail.available);
        }
      }
    }
  }

  function deferred() {
    const o = {};
    o.promise = new Promise((resolve, reject) => {
      o.resolve = resolve;
      o.reject = reject;
    });
    return o;
  }

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

  function applyOnMessage(request) {
    if (request.method === 'ping') {
      return true;
    }
    if (STYLE_VIA_API) {
      if (request.method === 'urlChanged') {
        request.method = 'styleReplaceAll';
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
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(sections => {
              if (!sections[request.style.id]) {
                removeStyle(request.style);
              } else {
                applyStyles(sections);
              }
            });
        } else {
          removeStyle(request.style);
        }
        break;

      case 'styleAdded':
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(applyStyles);
        }
        break;

      case 'urlChanged':
        API.getSectionsByUrl(getMatchUrl())
          .then(replaceAll);
        break;

      case 'backgroundReady':
        initializing
          .catch(err => {
            if (msg.RX_NO_RECEIVER.test(err.message)) {
              return init();
            }
          })
          .catch(console.error);
        break;

      case 'updateCount':
        updateCount();
        break;
    }
  }

  function doDisableAll(disable = disableAll) {
    if (!disable === !disableAll) {
      return;
    }
    disableAll = disable;
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'prefChanged', prefs: {disableAll}});
    } else {
      Array.prototype.forEach.call(document.styleSheets, stylesheet => {
        if (stylesheet.ownerNode.matches(`style.stylus[id^="${ID_PREFIX}"]`)
        && stylesheet.disabled !== disable) {
          stylesheet.disabled = disable;
        }
      });
    }
  }

  function fetchParentDomain() {
    if (parentDomain) {
      return Promise.resolve();
    }
    return API.getTabUrlPrefix()
      .then(newDomain => {
        parentDomain = newDomain;
      });
  }

  function updateExposeIframes() {
    if (!prefs.get('exposeIframes') || window === parent || !styleElements.size) {
      document.documentElement.removeAttribute('stylus-iframe');
    } else {
      fetchParentDomain().then(() => {
        document.documentElement.setAttribute('stylus-iframe', parentDomain);
      });
    }
  }

  function updateCount() {
    if (window !== parent) {
      // we don't care about iframes
      return;
    }
    if (/^\w+?-extension:\/\/.+(popup|options)\.html$/.test(location.href)) {
      // popup and the option page are not tabs
      return;
    }
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'updateCount'}).catch(msg.ignoreError);
      return;
    }
    let count = 0;
    for (const id of styleElements.keys()) {
      if (!disabledElements.has(id)) {
        count++;
      }
    }
    // we have to send the tabId so we can't use `sendBg` that is used by `API`
    msg.send({
      method: 'invokeAPI',
      name: 'updateIconBadge',
      args: [count]
    }).catch(console.error);
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
        return API.getSectionsByUrl(getMatchUrl(), id)
          .then(applyStyles);
      }
    } else {
      if (inDoc) {
        disabledElements.set(id, inDoc);
        docRootObserver.evade(() => inDoc.remove());
      }
    }
    updateCount();
  }

  function removeStyle({id}) {
    const el = document.getElementById(ID_PREFIX + id);
    if (el) {
      docRootObserver.evade(() => el.remove());
    }
    disabledElements.delete(id);
    if (styleElements.delete(id)) {
      updateCount();
    }
  }

  function applyStyles(sections, done) {
    if (!Object.keys(sections).length) {
      if (done) {
        done();
      }
      return;
    }

    if (!document.documentElement) {
      new MutationObserver((mutations, observer) => {
        if (document.documentElement) {
          observer.disconnect();
          applyStyles(sections, done);
        }
      }).observe(document, {childList: true});
      return;
    }

    if (docRootObserver) {
      docRootObserver.stop();
    } else {
      initDocRootObserver();
    }
    const pending = [];
    for (const section of Object.values(sections)) {
      pending.push(applySections(section.id, section.code.join('')));
    }
    docRootObserver.firstStart();

    if (!isOwnPage && !docRewriteObserver && styleElements.size) {
      initDocRewriteObserver();
    }

    updateExposeIframes();
    updateCount();
    if (done) {
      Promise.all(pending).then(done);
    }
  }

  function applySections(id, code) {
    let el = styleElements.get(id) || document.getElementById(ID_PREFIX + id);
    if (el && CHROME < 3321) {
      // workaround for Chrome devtools bug fixed in v65
      el.remove();
      el = null;
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
      el.id = ID_PREFIX + id;
      el.type = 'text/css';
      // SVG className is not a string, but an instance of SVGAnimatedString
      el.classList.add('stylus');
      addStyleElement(el);
    }
    let settingStyle;
    if (el.textContent !== code) {
      settingStyle = setStyleContent(el, code);
    }
    styleElements.set(id, el);
    disabledElements.delete(id);
    return Promise.resolve(settingStyle);
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
    applyStyles(newStyles);
    const removeOld = () => oldStyles.forEach(el => el.remove());
    if (docRewriteObserver) {
      docRootObserver.evade(removeOld);
    } else {
      removeOld();
    }
  }

  function applyTransitionPatch() {
    // CSS transition bug workaround: since we insert styles asynchronously,
    // the browsers, especially Firefox, may apply all transitions on page load
    const className = chrome.runtime.id + '-transition-bug-fix';
    const docId = document.documentElement.id ? '#' + document.documentElement.id : '';
    document.documentElement.classList.add(className);
    applySections(0, `
      ${docId}.${CSS.escape(className)}:root * {
        transition: none !important;
      }
    `)
      .then(() => {
        setTimeout(() => {
          removeStyle({id: 0});
          document.documentElement.classList.remove(className);
        });
      });
  }

  function getStyleId(el) {
    return parseInt(el.id.substr(ID_PREFIX.length));
  }

  function orphanCheck(e) {
    if (e && e.detail.method !== 'orphan') {
      return;
    }
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
