/* global msg API prefs createStyleInjector */
'use strict';

// Chrome reruns content script when documentElement is replaced.
// Note, we're checking against a literal `1`, not just `if (truthy)`,
// because <html id="INJECTED"> is exposed per HTML spec as a global variable and `window.INJECTED`.

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 && (() => {
  self.INJECTED = 1;

  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  const IS_OWN_PAGE = Boolean(chrome.tabs);
  const styleInjector = createStyleInjector({
    compare: (a, b) => a.id - b.id,
    onUpdate: onInjectorUpdate
  });
  const docRootObserver = createDocRootObserver({
    onChange: () => {
      if (styleInjector.outOfOrder()) {
        styleInjector.sort();
        return true;
      }
    }
  });
  const docRewriteObserver = createDocRewriteObserver({
    onChange: () => {
      docRootObserver.evade(styleInjector.sort);
    }
  });
  const initializing = init();
  // save it now because chrome.runtime will be unavailable in the orphaned script
  const orphanEventId = chrome.runtime.id;
  let isOrphaned;
  // firefox doesn't orphanize content scripts so the old elements stay
  if (!chrome.app) styleInjector.clearOrphans();

  msg.onTab(applyOnMessage);

  if (!IS_OWN_PAGE) {
    window.dispatchEvent(new CustomEvent(orphanEventId));
    window.addEventListener(orphanEventId, orphanCheck, true);
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
    if (isOrphaned) return;
    updateCount();
    updateExposeIframes();
  }

  function init() {
    return STYLE_VIA_API ?
      API.styleViaAPI({method: 'styleApply'}) :
      API.getSectionsByUrl(getMatchUrl()).then(applyStyles);
  }

  function getMatchUrl() {
    let matchUrl = location.href;
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
    if (STYLE_VIA_API) {
      if (request.method === 'urlChanged') {
        request.method = 'styleReplaceAll';
      }
      if (/^(style|updateCount)/.test(request.method)) {
        API.styleViaAPI(request);
        return;
      }
    }

    switch (request.method) {
      case 'ping':
        return true;

      case 'styleDeleted':
        styleInjector.remove(request.style.id);
        break;

      case 'styleUpdated':
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
    return msg.send({
      method: 'invokeAPI',
      name: 'getTabUrlPrefix',
      args: []
    })
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
    }).catch(console.error);
  }

  function applyStyles(sections) {
    return new Promise(resolve => {
      const styles = styleMapToArray(sections);
      if (styles.length) {
        docRootObserver.evade(() => {
          styleInjector.addMany(styles);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  function replaceAll(newStyles) {
    styleInjector.replaceAll(styleMapToArray(newStyles));
  }

  function styleMapToArray(styleMap) {
    return Object.values(styleMap).map(s => ({
      id: s.id,
      code: s.code.join(''),
    }));
  }

  function orphanCheck() {
    try {
      if (chrome.i18n.getUILanguage()) return;
    } catch (e) {}
    // In Chrome content script is orphaned on an extension update/reload
    // so we need to detach event listeners
    window.removeEventListener(orphanEventId, orphanCheck, true);
    isOrphaned = true;
    styleInjector.clear();
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
    let digest = 0;
    let lastCalledTime = NaN;
    let observing = false;
    const observer = new MutationObserver(() => {
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
    return {start, stop, evade};

    function start() {
      if (observing) return;
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

    function evade(fn) {
      if (observing) {
        stop();
        _run(fn);
        start();
      } else {
        _run(fn);
      }
    }

    function _run(fn) {
      if (document.documentElement) {
        fn();
      } else {
        new MutationObserver((mutations, observer) => {
          if (document.documentElement) {
            observer.disconnect();
            fn();
          }
        }).observe(document, {childList: true});
      }
    }
  }
})();
