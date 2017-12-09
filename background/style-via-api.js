/* global getStyles */
'use strict';

// eslint-disable-next-line no-var
var styleViaAPI = !CHROME &&
(() => {
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
  const onError = () => NOP;

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

  //////////////////// public

  function process(request, sender) {
    const action = ACTIONS[request.action || request.method];
    return !action ? NOP :
      isNaN(sender.frameId) && maybeProcessAllFrames(request, sender) ||
      (action(request, sender) || NOP)
        .catch(onError)
        .then(maybeToggleObserver);
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

  //////////////////// actions

  function styleApply({id = null, styles, ignoreUrlCheck}, sender) {
    if (prefs.get('disableAll')) {
      return;
    }
    const {tab, frameId, url = getFrameUrl(tab.id, frameId)} = sender;
    const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
    if (id === null && !ignoreUrlCheck && frameStyles.url === url) {
      return;
    }
    const apply = styles => {
      const newFrameStyles = buildNewFrameStyles(styles, frameStyles);
      if (newFrameStyles) {
        tabFrames[frameId] = newFrameStyles;
        cache.set(tab.id, tabFrames);
        return replaceCSS(tab.id, frameId, frameStyles, newFrameStyles);
      }
    };
    return styles ? apply(styles) || NOP :
      getStyles({id, matchUrl: url, enabled: true, asHash: true}).then(apply);
  }

  function styleDeleted({id}, {tab, frameId}) {
    const {frameStyles, styleSections} = getCachedData(tab.id, frameId, id);
    if (styleSections.length) {
      const oldFrameStyles = Object.assign({}, frameStyles);
      delete frameStyles[id];
      return replaceCSS(tab.id, frameId, oldFrameStyles, frameStyles);
    }
  }

  function styleUpdated({style}, sender) {
    return (style.enabled ? styleApply : styleDeleted)(style, sender);
  }

  function styleAdded({style}, sender) {
    return style.enabled ? styleApply(style, sender) : NOP;
  }

  function styleReplaceAll(request, sender) {
    request.ignoreUrlCheck = true;
    return styleApply(request, sender);
  }

  function prefChanged({prefs}, sender) {
    if ('disableAll' in prefs) {
      disableAll(prefs.disableAll, sender);
    } else {
      return NOP;
    }
  }

  function ping() {
    return PONG;
  }

  //////////////////// action helpers

  function disableAll(state, sender) {
    if (state) {
      const {tab, frameId} = sender;
      const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
      delete tabFrames[frameId];
      return removeCSS(tab.id, frameId, frameStyles);
    } else {
      return styleApply({ignoreUrlCheck: true}, sender);
    }
  }

  //////////////////// observer

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

  //////////////////// browser API

  function replaceCSS(tabId, frameId, oldStyles, newStyles) {
    return insertCSS(tabId, frameId, newStyles).then(() =>
      removeCSS(tabId, frameId, oldStyles));
  }

  function insertCSS(tabId, frameId, frameStyles) {
    const code = getFrameCode(frameStyles);
    return code && browser.tabs.insertCSS(tabId, {
      // we cache a shallow copy of code from the sections array in order to reuse references
      // in other places whereas the combined string gets garbage-collected
      code,
      frameId,
      runAt: 'document_start',
      matchAboutBlank: true,
    }).catch(onError);
  }

  function removeCSS(tabId, frameId, frameStyles) {
    const code = getFrameCode(frameStyles);
    return code && browser.tabs.removeCSS(tabId, {
      code,
      frameId,
      matchAboutBlank: true
    }).catch(onError);
  }

  //////////////////// utilities

  function maybeProcessAllFrames(request, sender) {
    const {tab} = sender;
    const frameIds = Object.keys(allFrameUrls.get(tab.id) || {});
    if (frameIds.length <= 1) {
      sender.frameId = 0;
      return false;
    } else {
      return Promise.all(
        frameIds.map(frameId =>
          process(request, {tab, sender: {frameId: Number(frameId)}})));
    }
  }

  function buildNewFrameStyles(styles, oldStyles, url) {
    let allSame = true;
    let newStyles = {};
    for (const sections of getSortedById(styles)) {
      const cachedSections = oldStyles[sections.id] || [];
      const newSections = [];
      let i = 0;
      allSame &= sections.length === cachedSections.length;
      for (const {code} of sections) {
        allSame = allSame ? code === cachedSections[i] : allSame;
        newSections[i++] = code;
      }
      newStyles[sections.id] = newSections;
    }
    if (!allSame) {
      newStyles = Object.assign({}, oldStyles, newStyles);
      defineProperty(newStyles, 'url', url);
      return newStyles;
    }
  }

  function getSortedById(styleHash) {
    const styles = [];
    let needsSorting = false;
    let prevKey = -1;
    for (let k in styleHash) {
      k = parseInt(k);
      if (!isNaN(k)) {
        const sections = styleHash[k];
        styles.push(sections);
        Object.defineProperty(sections, 'id', {value: k});
        needsSorting |= k < prevKey;
        prevKey = k;
      }
    }
    return needsSorting ? styles.sort((a, b) => a.id - b.id) : styles;
  }

  function getCachedData(tabId, frameId, styleId) {
    const tabFrames = cache.get(tabId) || {};
    const frameStyles = tabFrames[frameId] || {};
    const styleSections = styleId && frameStyles[styleId] || [];
    return {tabFrames, frameStyles, styleSections};
  }

  function getFrameCode(frameStyles) {
    return [].concat(...getSortedById(frameStyles)).join('\n');
  }

  function defineProperty(obj, name, value) {
    return Object.defineProperty(obj, name, {value, configurable: true});
  }

  function isEmpty(obj) {
    for (const k in obj) {
      return false;
    }
    return true;
  }
})();
