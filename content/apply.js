'use strict';

define(require => {
  const {API, msg} = require('/js/msg');
  const prefs = require('/js/prefs');

  let IS_TAB = !chrome.tabs || location.pathname !== '/popup.html';
  const IS_FRAME = window !== parent;
  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  /** @type {StyleInjector} */
  const styleInjector = require('/content/style-injector')({
    compare: (a, b) => a.id - b.id,
    onUpdate: onInjectorUpdate,
  });

  // save it now because chrome.runtime will be unavailable in the orphaned script
  const orphanEventId = chrome.runtime.id;
  let isOrphaned;
  // firefox doesn't orphanize content scripts so the old elements stay
  if (!chrome.app) styleInjector.clearOrphans();

  /** @type chrome.runtime.Port */
  let port;
  let lazyBadge = IS_FRAME;
  let parentDomain;

  // Declare all vars before init() or it'll throw due to "temporal dead zone" of const/let
  const initializing = init();

  // the popup needs a check as it's not a tab but can be opened in a tab manually for whatever reason
  if (!IS_TAB) {
    chrome.tabs.getCurrent(tab => {
      IS_TAB = Boolean(tab);
      if (tab && styleInjector.list.length) updateCount();
    });
  }

  msg.onTab(applyOnMessage);

  if (!chrome.tabs) {
    window.dispatchEvent(new CustomEvent(orphanEventId));
    window.addEventListener(orphanEventId, orphanCheck, true);
  }

  function onInjectorUpdate() {
    if (!isOrphaned) {
      updateCount();
      const onOff = prefs[styleInjector.list.length ? 'subscribe' : 'unsubscribe'];
      onOff(['disableAll'], updateDisableAll);
      if (IS_FRAME) {
        updateExposeIframes();
        onOff(['exposeIframes'], updateExposeIframes);
      }
    }
  }

  async function init() {
    if (STYLE_VIA_API) {
      await API.styleViaAPI({method: 'styleApply'});
    } else {
      const SYM_ID = 'styles';
      const SYM = Symbol.for(SYM_ID);
      const styles =
        window[SYM] ||
        (IS_FRAME && location.href === 'about:blank'
          ? getParentStyles(SYM_ID)
          : chrome.app && !chrome.tabs && getStylesViaXhr()) ||
        await API.styles.getSectionsByUrl(getMatchUrl(), null, true);
      window[SYM] = styles;
      if (styles.disableAll) {
        delete styles.disableAll;
        styleInjector.toggle(false);
      }
      await styleInjector.apply(styles);
    }
  }

  function getParentStyles(id) {
    try {
      return parent[parent.Symbol.for(id)];
    } catch (e) {}
  }

  function getStylesViaXhr() {
    try {
      const blobId = document.cookie.split(chrome.runtime.id + '=')[1].split(';')[0];
      const url = 'blob:' + chrome.runtime.getURL(blobId);
      document.cookie = `${chrome.runtime.id}=1; max-age=0`; // remove our cookie
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false); // synchronous
      xhr.send();
      URL.revokeObjectURL(url);
      return JSON.parse(xhr.response);
    } catch (e) {}
  }

  function getMatchUrl() {
    let matchUrl = location.href;
    if (!chrome.tabs && !matchUrl.match(/^(http|file|chrome|ftp)/)) {
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
          API.styles.getSectionsByUrl(getMatchUrl(), request.style.id)
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
          API.styles.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(styleInjector.apply);
        }
        break;

      case 'urlChanged':
        API.styles.getSectionsByUrl(getMatchUrl())
          .then(styleInjector.replace);
        break;

      case 'backgroundReady':
        initializing.catch(err =>
          msg.isIgnorableError(err)
            ? init()
            : console.error(err));
        break;

      case 'updateCount':
        updateCount();
        break;
    }
  }

  function updateDisableAll(key, disableAll) {
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'prefChanged', prefs: {disableAll}});
    } else {
      styleInjector.toggle(!disableAll);
    }
  }

  async function updateExposeIframes(key, value = prefs.get('exposeIframes')) {
    const attr = 'stylus-iframe';
    const el = document.documentElement;
    if (!el) return; // got no styles so styleInjector didn't wait for <html>
    if (!value || !styleInjector.list.length) {
      el.removeAttribute(attr);
    } else {
      if (!parentDomain) parentDomain = await API.getTabUrlPrefix();
      // Check first to avoid triggering DOM mutation
      if (el.getAttribute(attr) !== parentDomain) {
        el.setAttribute(attr, parentDomain);
      }
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
});
