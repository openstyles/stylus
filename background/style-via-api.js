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
    styleReplaceAll: styleApply,
    prefChanged,
    ping,
  };
  const NOP = Promise.resolve(new Error('NOP'));
  const PONG = Promise.resolve(true);
  const onError = () => NOP;

  const cache = new Map();
  const allFrameUrls = new Map();

  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.tabs.onReplaced.addListener(onTabReplaced);

  return {
    process,
    getFrameUrl,
    setFrameUrl,
    allFrameUrls,
    cache,
  };

  //region public methods

  function process(request, sender) {
    console.log(request.action || request.method, request.prefs || request.styles || request.style, sender.tab, sender.frameId);
    const action = ACTIONS[request.action || request.method];
    if (!action) {
      return NOP;
    }
    const {tab} = sender;
    if (!isNaN(sender.frameId)) {
      const result = action(request, sender);
      return result ? result.catch(onError) : NOP;
    }
    return browser.webNavigation.getAllFrames({tabId: tab.id}).then(frames =>
      Promise.all((frames || []).map(({frameId}) =>
        (action(request, {tab, frameId}) || NOP).catch(onError)))
    ).catch(onError);
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

  //endregion
  //region actions

  function styleApply({styles, disableAll}, sender) {
    if (disableAll) {
      return;
    }
    const {tab: {id: tabId}, frameId, url} = sender;
    if (!styles || styles === 'DIY') {
      return requestStyles({matchUrl: url || getFrameUrl(tabId, frameId)}, sender);
    }
    const {tabFrames, frameStyles} = getCachedData(tabId, frameId);
    const newSorted = getSortedById(styles);
    if (!sameArrays(frameStyles, newSorted, sameArrays)) {
      tabFrames[frameId] = newSorted;
      cache.set(tabId, tabFrames);
      return replaceCSS(tabId, frameId, frameStyles, newSorted);
    }
  }

  function styleDeleted({id}, {tab, frameId}) {
    const {frameStyles} = getCachedData(tab.id, frameId);
    const index = frameStyles.findIndex(item => item.id === id);
    if (index >= 0) {
      const oldStyles = frameStyles.slice();
      frameStyles.splice(index, 1);
      return replaceCSS(tab.id, frameId, oldStyles, frameStyles);
    }
  }

  function styleUpdated({style}, sender) {
    return (style.enabled ? styleApply : styleDeleted)(style, sender);
  }

  function styleAdded({style: {enabled}}, sender) {
    return enabled && styleApply({}, sender);
  }

  function prefChanged({prefs}, sender) {
    if ('disableAll' in prefs) {
      disableAll(prefs.disableAll, sender);
    }
  }

  function ping() {
    return PONG;
  }

  //endregion
  //region action helpers

  function disableAll(state, sender) {
    if (state) {
      const {tab, frameId} = sender;
      const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
      delete tabFrames[frameId];
      return removeCSS(tab.id, frameId, frameStyles);
    } else {
      return styleApply({}, sender);
    }
  }

  //endregion
  //region observer

  function onTabRemoved(tabId) {
    cache.delete(tabId);
  }

  function onTabReplaced(addedTabId, removedTabId) {
    cache.delete(removedTabId);
  }

  //endregion
  //region browser API

  function replaceCSS(tabId, frameId, oldStyles, newStyles) {
    console.log.apply(null, arguments);
    return insertCSS(tabId, frameId, newStyles).then(() =>
      removeCSS(tabId, frameId, oldStyles));
  }

  function insertCSS(tabId, frameId, frameStyles) {
    const code = getFrameCode(frameStyles);
    return !code ? NOP :
      browser.tabs.insertCSS(tabId, {
        code,
        frameId,
        runAt: 'document_start',
        matchAboutBlank: true,
      }).catch(onError);
  }

  function removeCSS(tabId, frameId, frameStyles) {
    const code = getFrameCode(frameStyles);
    return !code ? NOP :
      browser.tabs.removeCSS(tabId, {
        code,
        frameId,
        matchAboutBlank: true
      }).catch(onError);
  }

  //endregion
  //region utilities

  function requestStyles(options, sender) {
    options.matchUrl = options.matchUrl || sender.url;
    options.enabled = true;
    options.asHash = true;
    return getStyles(options).then(styles =>
      styleApply({styles}, sender));
  }

  function getSortedById(styleHash) {
    const styles = [];
    let needsSorting = false;
    let prevKey = -1;
    for (let k in styleHash) {
      k = parseInt(k);
      if (!isNaN(k)) {
        const sections = styleHash[k].map(({code}) => code);
        styles.push(sections);
        defineProperty(sections, 'id', k);
        needsSorting |= k < prevKey;
        prevKey = k;
      }
    }
    return needsSorting ? styles.sort((a, b) => a.id - b.id) : styles;
  }

  function getCachedData(tabId, frameId, styleId) {
    const tabFrames = cache.get(tabId) || {};
    const frameStyles = tabFrames[frameId] || [];
    const styleSections = styleId && frameStyles.find(s => s.id === styleId) || [];
    return {tabFrames, frameStyles, styleSections};
  }

  function getFrameCode(frameStyles) {
    // we cache a shallow copy of code from the sections array in order to reuse references
    // in other places whereas the combined string gets garbage-collected
    return typeof frameStyles === 'string' ? frameStyles : [].concat(...frameStyles).join('\n');
  }

  function defineProperty(obj, name, value) {
    return Object.defineProperty(obj, name, {value, configurable: true});
  }

  function sameArrays(a, b, fn) {
    return a.length === b.length && a.every((el, i) => fn ? fn(el, b[i]) : el === b[i]);
  }

  //endregion
})();
