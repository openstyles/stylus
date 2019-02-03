/* eslint no-var: 0 */
/* global msg API prefs createStyleInjector */
/* exported APPLY */
'use strict';

// some weird bug in new Chrome: the content script gets injected multiple times
// define a constant so it throws when redefined
const APPLY = (() => {
  const CHROME = chrome.app ? parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) : NaN;
  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  const IS_OWN_PAGE = location.protocol.endsWith('-extension:');
  const setStyleContent = createSetStyleContent();
  const styleInjector = createStyleInjector({
    compare: (a, b) => a.id - b.id,
    setStyleContent,
    onUpdate: onInjectorUpdate
  });
  const docRootObserver = createDocRootObserver({
    onChange: () => {
      if (styleInjector.outOfOrder()) {
        styleInjector.sort();
      }
    }
  });
  const docRewriteObserver = createDocRewriteObserver({
    onChange: () => {
      docRootObserver.stop();
      styleInjector.sort();
      docRootObserver.start();
    }
  });
  const initializing = init();

  msg.onTab(applyOnMessage);

  if (!IS_OWN_PAGE) {
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

  function onInjectorUpdate() {
    if (!IS_OWN_PAGE && styleInjector.list.length) {
      docRewriteObserver.start();
      docRootObserver.start();
    } else {
      docRewriteObserver.stop();
      docRootObserver.stop();
    }
    updateCount();
    updateExposeIframes();
  }

  function init() {
    if (STYLE_VIA_API) {
      return API.styleViaAPI({method: 'styleApply'});
    }
    return API.getSectionsByUrl(getMatchUrl())
      .then(result =>
        applyStyles(result)
          .then(() => {
            // CSS transition bug workaround: since we insert styles asynchronously,
            // the browsers, especially Firefox, may apply all transitions on page load
            if (Object.values(result).some(s => s.code.includes('transition'))) {
              applyTransitionPatch();
            }
          })
      );
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
        ready = CHROME || IS_OWN_PAGE || Event.prototype.getPreventDefault ?
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
        styleInjector.remove(request.style.id);
        break;

      case 'styleUpdated':
        // FIXME: should we use `styleInjector.toggle` when
        // `request.codeIsUpdated === false`?
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(sections => {
              if (!sections[request.style.id]) {
                styleInjector.remove(request.style.id);
              } else {
                applyStyles(sections);
              }
            });
        } else {
          styleInjector.remove(request.style.id);
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

  function doDisableAll(disableAll) {
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'prefChanged', prefs: {disableAll}});
    } else {
      styleInjector.toggle(!disableAll);
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
    if (!prefs.get('exposeIframes') || window === parent || !styleInjector.list.length) {
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
    // we have to send the tabId so we can't use `sendBg` that is used by `API`
    msg.send({
      method: 'invokeAPI',
      name: 'updateIconBadge',
      args: [styleInjector.list.length]
    }).catch(msg.ignoreError);
  }

  function rootReady() {
    if (document.documentElement) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      new MutationObserver((mutations, observer) => {
        if (document.documentElement) {
          observer.disconnect();
          resolve();
        }
      }).observe(document, {childList: true});
    });
  }

  function applyStyles(sections) {
    if (!Object.keys(sections).length) {
      return Promise.resolve();
    }
    return rootReady().then(() =>
      docRootObserver.evade(() =>
        styleInjector.addMany(
          Object.values.map(s => ({id: s.id, code: s.code.join('')}))
        )
      )
    );
  }

  function replaceAll(newStyles) {
    styleInjector.replaceAll(
      Object.values(newStyles)
        .map(s => ({id: s.id, code: s.code.join('')}))
    );
  }

  function applyTransitionPatch() {
    // CSS transition bug workaround: since we insert styles asynchronously,
    // the browsers, especially Firefox, may apply all transitions on page load
    const className = chrome.runtime.id + '-transition-bug-fix';
    const docId = document.documentElement.id ? '#' + document.documentElement.id : '';
    document.documentElement.classList.add(className);
    const el = styleInjector.createStyle('transition-patch');
    document.documentElement.appendChild(el);
    setStyleContent(`
      ${docId}.${CSS.escape(className)}:root * {
        transition: none !important;
      }
    `)
      .then(() => {
        setTimeout(() => {
          el.remove();
          document.documentElement.classList.remove(className);
        });
      });
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
    docRewriteObserver.stop();
    docRootObserver.stop();
    window.removeEventListener(chrome.runtime.id, orphanCheck, true);
    try {
      msg.off(applyOnMessage);
    } catch (e) {}
  }

  function createDocRewriteObserver({onChange}) {
    // detect documentElement being rewritten from inside the script
    let root;
    let observing = false;
    let timer;
    const observer = new MutationObserver(check);
    return {start, stop};

    function start() {
      if (observing) return;
      // detect dynamic iframes rewritten after creation by the embedder i.e. externally
      root = document.documentElement;
      timer = setTimeout(check);
      observer.observe(document, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      clearTimeout(timer);
      observer.disconnect();
      observing = false;
    }

    function check() {
      if (root !== document.documentElement) {
        root = document.documentElement;
        onChange();
      }
    }
  }

  function createDocRootObserver({onChange}) {
    let lastCalledTime = performance.now();
    let continuousCalledCount = 0;
    let observing = false;
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (now - lastCalledTime < 1000) {
        if (continuousCalledCount >= 5) {
          throw new Error('The page keep generating mutations, skip the event.');
        }
        continuousCalledCount++;
      } else {
        continuousCalledCount = 0;
      }
      lastCalledTime = now;
      onChange();
    });
    return {start, stop, evade};

    function start() {
      if (observing) return;
      observer.observe(document.documentElement, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      observer.takeRecords();
      observer.disconnect();
      observing = false;
    }

    function evade(fn) {
      if (!observing) {
        return fn();
      }
      stop();
      const r = fn();
      start();
      return r;
    }
  }
})();
