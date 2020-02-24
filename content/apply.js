/* global msg API prefs createStyleInjector */
'use strict';

// Chrome reruns content script when documentElement is replaced.
// Note, we're checking against a literal `1`, not just `if (truthy)`,
// because <html id="INJECTED"> is exposed per HTML spec as a global variable and `window.INJECTED`.

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 && (() => {
  self.INJECTED = 1;

  let IS_TAB = !chrome.tabs || location.pathname !== '/popup.html';
  const IS_FRAME = window !== parent;
  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  const styleInjector = createStyleInjector({
    compare: (a, b) => a.id - b.id,
    onUpdate: onInjectorUpdate,
  });
  const initializing = init();
  /** @type chrome.runtime.Port */
  let port;
  let lazyBadge = IS_FRAME;

  // the popup needs a check as it's not a tab but can be opened in a tab manually for whatever reason
  if (!IS_TAB) {
    chrome.tabs.getCurrent(tab => {
      IS_TAB = Boolean(tab);
      if (tab && styleInjector.list.length) updateCount();
    });
  }

  // save it now because chrome.runtime will be unavailable in the orphaned script
  const orphanEventId = chrome.runtime.id;
  let isOrphaned;
  // firefox doesn't orphanize content scripts so the old elements stay
  if (!chrome.app) styleInjector.clearOrphans();

  msg.onTab(applyOnMessage);

  if (!chrome.tabs) {
    window.dispatchEvent(new CustomEvent(orphanEventId));
    window.addEventListener(orphanEventId, orphanCheck, true);
  }

  let parentDomain;

  prefs.subscribe(['disableAll'], (key, value) => doDisableAll(value));
  if (IS_FRAME) {
    prefs.subscribe(['exposeIframes'], updateExposeIframes);
  }

  function onInjectorUpdate() {
    if (!isOrphaned) {
      updateCount();
      updateExposeIframes();
    }
  }

  function init() {
    return STYLE_VIA_API ?
      API.styleViaAPI({method: 'styleApply'}) :
      API.getSectionsByUrl(getMatchUrl()).then(styleInjector.apply);
  }

  function getMatchUrl() {
    let matchUrl = location.href;
    if (!matchUrl.match(/^(http|file|chrome|ftp)/)) {
      // dynamic about: and javascript: iframes don't have an URL yet
      // so we'll try the parent frame which is guaranteed to have a real URL
      try {
        if (IS_FRAME) {
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
                styleInjector.apply(sections);
              }
            });
        } else {
          styleInjector.remove(request.style.id);
        }
        break;

      case 'styleAdded':
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(styleInjector.apply);
        }
        break;

      case 'urlChanged':
        API.getSectionsByUrl(getMatchUrl())
          .then(styleInjector.replace);
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
    return parentDomain ?
      Promise.resolve() :
      API.getTabUrlPrefix()
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
    if (!IS_TAB) return;
    if (IS_FRAME) {
      if (!port && styleInjector.list.length) {
        port = chrome.runtime.connect({name: 'iframe'});
      } else if (port && !styleInjector.list.length) {
        port.disconnect();
      }
      if (lazyBadge && performance.now() > 1000) lazyBadge = false;
    }
    (STYLE_VIA_API ?
      API.styleViaAPI({method: 'updateCount'}) :
      API.updateIconBadge(styleInjector.list.map(style => style.id), {lazyBadge})
    ).catch(msg.ignoreError);
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
})();
