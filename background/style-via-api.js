/* global getStyles */
'use strict';

// eslint-disable-next-line no-var
var styleViaAPI = !CHROME && (() => {
  const ACTIONS = {
    styleApply,
    styleDeleted,
    styleUpdated,
    styleAdded,
    styleReplaceAll,
    prefChanged,
    ping,
  };
  const NOP = Promise.resolve(new Error('NOP'));
  const PONG = Promise.resolve(true);
  const onError = () => {};

  /* <tabId>: Object
       <frameId>: Object
         url: String, non-enumerable
         <styleId>: Array of strings
           section code */
  const cache = new Map();
  const allFrameUrls = new Map();

  let observingTabs = false;

  return {
    process,
    getFrameUrl,
    setFrameUrl,
    allFrameUrls,
    cache,
  };

  function process(request, sender) {
    const action = ACTIONS[request.action || request.method];
    if (!action) {
      return NOP;
    }
    const {frameId, tab: {id: tabId}} = sender;
    if (isNaN(frameId)) {
      const frameIds = Object.keys(allFrameUrls.get(tabId) || {});
      if (frameIds.length > 1) {
        return Promise.all(
          frameIds.map(frameId =>
            process(request, Object.assign({}, sender, {frameId: Number(frameId)}))));
      }
      sender.frameId = 0;
    }
    return action(request, sender)
      .catch(onError)
      .then(maybeToggleObserver);
  }

  function styleApply({
    id = null,
    ignoreUrlCheck,
  }, {
    tab,
    frameId,
    url = getFrameUrl(tab.id, frameId),
  }) {
    if (prefs.get('disableAll')) {
      return NOP;
    }
    const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
    if (id === null && !ignoreUrlCheck && frameStyles.url === url) {
      return NOP;
    }
    return getStyles({id, matchUrl: url, enabled: true, asHash: true}).then(styles => {
      const tasks = [];
      for (const styleId in styles) {
        if (isNaN(parseInt(styleId))) {
          continue;
        }
        // shallow-extract code from the sections array in order to reuse references
        // in other places whereas the combined string gets garbage-collected
        const styleSections = styles[styleId].map(section => section.code);
        const code = styleSections.join('\n');
        if (!code) {
          delete frameStyles[styleId];
          continue;
        }
        if (code === (frameStyles[styleId] || []).join('\n')) {
          continue;
        }
        frameStyles[styleId] = styleSections;
        tasks.push(
          browser.tabs.insertCSS(tab.id, {
            code,
            frameId,
            runAt: 'document_start',
            matchAboutBlank: true,
            cssOrigin: 'user',
          }).catch(onError));
      }
      Object.defineProperty(frameStyles, 'url', {value: url, configurable: true});
      tabFrames[frameId] = frameStyles;
      cache.set(tab.id, tabFrames);
      return Promise.all(tasks);
    });
  }

  function styleDeleted({id}, {tab, frameId}) {
    const {frameStyles, styleSections} = getCachedData(tab.id, frameId, id);
    const code = styleSections.join('\n');
    if (code && !duplicateCodeExists({frameStyles, id, code})) {
      return removeCSS(tab.id, frameId, code).then(() => {
        delete frameStyles[id];
      });
    } else {
      return NOP;
    }
  }

  function styleUpdated({style}, sender) {
    if (!style.enabled) {
      return styleDeleted(style, sender);
    }
    const {tab, frameId} = sender;
    const {frameStyles, styleSections} = getCachedData(tab.id, frameId, style.id);
    const code = styleSections.join('\n');
    return styleApply(style, sender).then(code && (() => {
      if (!duplicateCodeExists({frameStyles, code, id: null})) {
        return removeCSS(tab.id, frameId, code);
      }
    }));
  }

  function styleAdded({style}, sender) {
    return style.enabled ? styleApply(style, sender) : NOP;
  }

  function styleReplaceAll(request, sender) {
    const {tab, frameId} = sender;
    const oldStylesCode = getFrameStylesJoined(sender);
    return styleApply({ignoreUrlCheck: true}, sender).then(() => {
      const newStylesCode = getFrameStylesJoined(sender);
      const tasks = oldStylesCode
        .filter(code => !newStylesCode.includes(code))
        .map(code => removeCSS(tab.id, frameId, code));
      return Promise.all(tasks);
    });
  }

  function prefChanged({prefs}, sender) {
    if ('disableAll' in prefs) {
      if (!prefs.disableAll) {
        return styleApply({}, sender);
      }
      const {tab, frameId} = sender;
      const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
      if (isEmpty(frameStyles)) {
        return NOP;
      }
      delete tabFrames[frameId];
      const tasks = Object.keys(frameStyles)
        .map(id => removeCSS(tab.id, frameId, frameStyles[id].join('\n')));
      return Promise.all(tasks);
    } else {
      return NOP;
    }
  }

  function ping() {
    return PONG;
  }

  /* utilities */

  function maybeToggleObserver(passthru) {
    let method;
    if (!observingTabs && cache.size) {
      method = 'addListener';
    } else if (observingTabs && !cache.size) {
      method = 'removeListener';
    } else {
      return passthru;
    }
    observingTabs = !observingTabs;
    chrome.webNavigation.onCommitted[method](onNavigationCommitted);
    chrome.tabs.onRemoved[method](onTabRemoved);
    chrome.tabs.onReplaced[method](onTabReplaced);
    return passthru;
  }

  function onNavigationCommitted({tabId, frameId}) {
    if (frameId === 0) {
      onTabRemoved(tabId);
      return;
    }
    const tabFrames = cache.get(tabId);
    if (tabFrames && frameId in tabFrames) {
      delete tabFrames[frameId];
      if (isEmpty(tabFrames)) {
        onTabRemoved(tabId);
      }
    }
  }

  function onTabRemoved(tabId) {
    cache.delete(tabId);
    maybeToggleObserver();
  }

  function onTabReplaced(addedTabId, removedTabId) {
    onTabRemoved(removedTabId);
  }

  function getCachedData(tabId, frameId, styleId) {
    const tabFrames = cache.get(tabId) || {};
    const frameStyles = tabFrames[frameId] || {};
    const styleSections = styleId && frameStyles[styleId] || [];
    return {tabFrames, frameStyles, styleSections};
  }

  function getFrameUrl(tabId, frameId = 0) {
    const frameUrls = allFrameUrls.get(tabId);
    return frameUrls && frameUrls[frameId] || '';
  }

  function setFrameUrl(tabId, frameId, url) {
    const frameUrls = allFrameUrls.get(tabId);
    if (frameUrls) {
      frameUrls[frameId] = url;
    } else {
      allFrameUrls.set(tabId, {[frameId]: url});
    }
  }

  function getFrameStylesJoined({
    tab,
    frameId,
    frameStyles = getCachedData(tab.id, frameId).frameStyles,
  }) {
    return Object.keys(frameStyles).map(id => frameStyles[id].join('\n'));
  }

  function duplicateCodeExists({
    tab,
    frameId,
    frameStyles = getCachedData(tab.id, frameId).frameStyles,
    frameStylesCode = {},
    id,
    code = frameStylesCode[id] || frameStyles[id].join('\n'),
  }) {
    id = String(id);
    for (const styleId in frameStyles) {
      if (id !== styleId &&
          code === (frameStylesCode[styleId] || frameStyles[styleId].join('\n'))) {
        return true;
      }
    }
  }

  function removeCSS(tabId, frameId, code) {
    return browser.tabs.removeCSS(tabId, {frameId, code, matchAboutBlank: true})
      .catch(onError);
  }

  function isEmpty(obj) {
    for (const k in obj) {
      return false;
    }
    return true;
  }
})();
