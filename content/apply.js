/* global API msg */// msg.js
/* global StyleInjector */
/* global prefs */
'use strict';

(() => {
  if (window.INJECTED === 1) return;

  let hasStyles = false;
  let isTab = !chrome.tabs || location.pathname !== '/popup.html';
  const isFrame = window !== parent;
  const isFrameAboutBlank = isFrame && location.href === 'about:blank';
  const isUnstylable = !chrome.app && document instanceof XMLDocument;
  const styleInjector = StyleInjector({
    compare: (a, b) => a.id - b.id,
    onUpdate: onInjectorUpdate,
  });
  // dynamic about: and javascript: iframes don't have a URL yet so we'll use their parent
  const matchUrl = isFrameAboutBlank && tryCatch(() => parent.location.href) || location.href;

  // save it now because chrome.runtime will be unavailable in the orphaned script
  const orphanEventId = chrome.runtime.id;
  let isOrphaned;
  // firefox doesn't orphanize content scripts so the old elements stay
  if (!chrome.app) styleInjector.clearOrphans();

  /** @type chrome.runtime.Port */
  let port;
  let lazyBadge = isFrame;
  let parentDomain;

  // Declare all vars before init() or it'll throw due to "temporal dead zone" of const/let
  const ready = init();

  // the popup needs a check as it's not a tab but can be opened in a tab manually for whatever reason
  if (!isTab) {
    chrome.tabs.getCurrent(tab => {
      isTab = Boolean(tab);
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
      onOff('disableAll', updateDisableAll);
      if (isFrame) {
        updateExposeIframes();
        onOff('exposeIframes', updateExposeIframes);
      }
    }
  }

  async function init() {
    if (isUnstylable) {
      await API.styleViaAPI({method: 'styleApply'});
    } else {
      const SYM_ID = 'styles';
      const SYM = Symbol.for(SYM_ID);
      const styles =
        window[SYM] ||
        (isFrameAboutBlank
          ? tryCatch(() => parent[parent.Symbol.for(SYM_ID)])
          : chrome.app && !chrome.tabs && tryCatch(getStylesViaXhr)) ||
        await API.styles.getSectionsByUrl(matchUrl, null, true);
      hasStyles = !styles.disableAll;
      if (hasStyles) {
        window[SYM] = styles;
        await styleInjector.apply(styles);
      } else {
        delete window[SYM];
        prefs.subscribe('disableAll', updateDisableAll);
      }
    }
  }

  /** Must be executed inside try/catch */
  function getStylesViaXhr() {
    const blobId = document.cookie.split(chrome.runtime.id + '=')[1].split(';')[0];
    const url = 'blob:' + chrome.runtime.getURL(blobId);
    document.cookie = `${chrome.runtime.id}=1; max-age=0`; // remove our cookie
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // synchronous
    xhr.send();
    URL.revokeObjectURL(url);
    return JSON.parse(xhr.response);
  }

  function applyOnMessage(request) {
    const {method} = request;
    if (isUnstylable) {
      if (method === 'urlChanged') {
        request.method = 'styleReplaceAll';
      }
      if (/^(style|updateCount)/.test(method)) {
        API.styleViaAPI(request);
        return;
      }
    }

    const {style} = request;
    switch (method) {
      case 'ping':
        return true;

      case 'styleDeleted':
        styleInjector.remove(style.id);
        break;

      case 'styleUpdated':
        if (style.enabled) {
          API.styles.getSectionsByUrl(matchUrl, style.id).then(sections =>
            sections[style.id]
              ? styleInjector.apply(sections)
              : styleInjector.remove(style.id));
        } else {
          styleInjector.remove(style.id);
        }
        break;

      case 'styleAdded':
        if (style.enabled) {
          API.styles.getSectionsByUrl(matchUrl, style.id)
            .then(styleInjector.apply);
        }
        break;

      case 'urlChanged':
        API.styles.getSectionsByUrl(matchUrl).then(sections => {
          hasStyles = true;
          styleInjector.replace(sections);
        });
        break;

      case 'backgroundReady':
        ready.catch(err =>
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
    if (isUnstylable) {
      API.styleViaAPI({method: 'prefChanged', prefs: {disableAll}});
    } else if (!hasStyles && !disableAll) {
      init();
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
    if (!isTab) return;
    if (isFrame) {
      if (!port && styleInjector.list.length) {
        port = chrome.runtime.connect({name: 'iframe'});
      } else if (port && !styleInjector.list.length) {
        port.disconnect();
      }
      if (lazyBadge && performance.now() > 1000) lazyBadge = false;
    }
    (isUnstylable ?
      API.styleViaAPI({method: 'updateCount'}) :
      API.updateIconBadge(styleInjector.list.map(style => style.id), {lazyBadge})
    ).catch(msg.ignoreError);
  }

  function tryCatch(func, ...args) {
    try {
      return func(...args);
    } catch (e) {}
  }

  function orphanCheck() {
    if (tryCatch(() => chrome.i18n.getUILanguage())) return;
    // In Chrome content script is orphaned on an extension update/reload
    // so we need to detach event listeners
    window.removeEventListener(orphanEventId, orphanCheck, true);
    isOrphaned = true;
    styleInjector.clear();
    tryCatch(msg.off, applyOnMessage);
  }
})();
