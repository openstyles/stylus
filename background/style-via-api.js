/* global getStyles API_METHODS */
'use strict';

API_METHODS.styleViaAPI = !CHROME && (() => {
  const ACTIONS = {
    styleApply,
    styleDeleted,
    styleUpdated,
    styleAdded,
    styleReplaceAll,
    prefChanged,
  };
  const NOP = Promise.resolve(new Error('NOP'));
  const onError = () => {};

  /* <tabId>: Object
       <frameId>: Object
         url: String, non-enumerable
         <styleId>: Array of strings
           section code */
  const cache = new Map();

  let observingTabs = false;

  return (request, sender) => {
    const action = ACTIONS[request.action];
    return !action ? NOP :
      action(request, sender)
        .catch(onError)
        .then(maybeToggleObserver);
  };

  function styleApply({id = null, ignoreUrlCheck}, {tab, frameId, url}) {
    if (prefs.get('disableAll')) {
      return NOP;
    }
    const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
    if (id === null && !ignoreUrlCheck && frameStyles.url === url) {
      return NOP;
    }
    return getStyles({id, matchUrl: url, asHash: true}).then(styles => {
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
          }).catch(onError));
      }
      if (!removeFrameIfEmpty(tab.id, frameId, tabFrames, frameStyles)) {
        Object.defineProperty(frameStyles, 'url', {value: url, configurable: true});
        tabFrames[frameId] = frameStyles;
        cache.set(tab.id, tabFrames);
      }
      return Promise.all(tasks);
    });
  }

  function styleDeleted({id}, {tab, frameId}) {
    const {tabFrames, frameStyles, styleSections} = getCachedData(tab.id, frameId, id);
    const code = styleSections.join('\n');
    if (code && !duplicateCodeExists({frameStyles, id, code})) {
      delete frameStyles[id];
      removeFrameIfEmpty(tab.id, frameId, tabFrames, frameStyles);
      return removeCSS(tab.id, frameId, code);
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
      removeFrameIfEmpty(tab.id, frameId, tabFrames, {});
      const tasks = Object.keys(frameStyles)
        .map(id => removeCSS(tab.id, frameId, frameStyles[id].join('\n')));
      return Promise.all(tasks);
    } else {
      return NOP;
    }
  }

  /* utilities */

  function maybeToggleObserver() {
    let method;
    if (!observingTabs && cache.size) {
      method = 'addListener';
    } else if (observingTabs && !cache.size) {
      method = 'removeListener';
    } else {
      return;
    }
    observingTabs = !observingTabs;
    chrome.webNavigation.onCommitted[method](onNavigationCommitted);
    chrome.tabs.onRemoved[method](onTabRemoved);
    chrome.tabs.onReplaced[method](onTabReplaced);
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

  function removeFrameIfEmpty(tabId, frameId, tabFrames, frameStyles) {
    if (isEmpty(frameStyles)) {
      delete tabFrames[frameId];
      if (isEmpty(tabFrames)) {
        cache.delete(tabId);
      }
      return true;
    }
  }

  function getCachedData(tabId, frameId, styleId) {
    const tabFrames = cache.get(tabId) || {};
    const frameStyles = tabFrames[frameId] || {};
    const styleSections = styleId && frameStyles[styleId] || [];
    return {tabFrames, frameStyles, styleSections};
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
