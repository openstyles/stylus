import '@/js/browser';
import * as prefs from '@/js/prefs';
import {isEmptyObj} from '@/js/util';
import {updateIconBadge} from './icon-manager';
import {webNavigation} from './navigation-manager';
import {getSectionsByUrl} from './style-manager';
import {order} from './style-manager/util';

/**
 * Uses chrome.tabs.insertCSS
 */
export default function initStyleViaApi() {
  const ACTIONS = {
    styleApply,
    styleDeleted,
    styleUpdated,
    styleAdded,
    urlChanged,
    injectorConfig,
    updateCount,
  };
  const onError = () => {};
  const calcOrder = ({id}) =>
    (order.prio[id] || 0) * 1e6 ||
    order.main[id] ||
    id + .5e6;
  /* <tabId>: Object
       <frameId>: Object
         url: String, non-enumerable
         <styleId>: Array of strings
           section code */
  const cache = new Map();
  let observingTabs = false;

  return /** @namespace API */ {
    async styleViaAPI(request) {
      try {
        const fn = ACTIONS[request.method];
        if (fn) await fn(request, this.sender);
      } finally {
        maybeToggleObserver();
      }
    },
  };

  function updateCount(request, sender) {
    const {tab, frameId} = sender;
    if (frameId) {
      throw new Error('we do not count styles for frames');
    }
    const {frameStyles} = getCachedData(tab.id, frameId);
    updateIconBadge.call({sender}, Object.keys(frameStyles));
  }

  async function styleApply({id = null, ignoreUrlCheck = false}, {tab, frameId, url}) {
    if (prefs.__values['disableAll']) {
      return;
    }
    const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
    if (id === null && !ignoreUrlCheck && frameStyles.url === url) {
      return;
    }
    const {sections} = getSectionsByUrl(url, {id});
    const tasks = [];
    for (const sec of sections.sort((a, b) => calcOrder(a) - calcOrder(b))) {
      const styleId = sec.id;
      const code = sec.code.join('\n');
      if (code === (frameStyles[styleId] || []).join('\n')) {
        continue;
      }
      frameStyles[styleId] = sec.code;
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
    await Promise.all(tasks);
    return updateCount(null, {tab, frameId});
  }

  async function styleDeleted({style: {id}}, {tab, frameId}) {
    const {tabFrames, frameStyles, styleSections} = getCachedData(tab.id, frameId, id);
    const code = styleSections.join('\n');
    if (code && !duplicateCodeExists({frameStyles, id, code})) {
      delete frameStyles[id];
      removeFrameIfEmpty(tab.id, frameId, tabFrames, frameStyles);
      await removeCSS(tab.id, frameId, code);
      updateCount(null, {tab, frameId});
    }
  }

  async function styleUpdated({style}, sender) {
    if (!style.enabled) {
      return styleDeleted({style}, sender);
    }
    const {tab, frameId} = sender;
    const {frameStyles, styleSections} = getCachedData(tab.id, frameId, style.id);
    const code = styleSections.join('\n');
    await styleApply(style, sender);
    if (code && !duplicateCodeExists({frameStyles, code, id: null})) {
      await removeCSS(tab.id, frameId, code);
    }
  }

  function styleAdded({style}, sender) {
    if (style.enabled) return styleApply(style, sender);
  }

  async function urlChanged(request, sender) {
    const {tab, frameId} = sender;
    const oldStylesCode = getFrameStylesJoined(sender);
    await styleApply({ignoreUrlCheck: true}, sender);
    const newStylesCode = getFrameStylesJoined(sender);
    return Promise.all(oldStylesCode
      .map(code => !newStylesCode.includes(code) && removeCSS(tab.id, frameId, code))
      .filter(Boolean));
  }

  async function injectorConfig({cfg: {off}}, sender) {
    if (off) {
      const {tab, frameId} = sender;
      const {tabFrames, frameStyles} = getCachedData(tab.id, frameId);
      if (!isEmptyObj(frameStyles)) {
        removeFrameIfEmpty(tab.id, frameId, tabFrames, {});
        await Promise.all(Object.keys(frameStyles).map(id =>
          removeCSS(tab.id, frameId, frameStyles[id].join('\n'))));
      }
    } else if (off != null) {
      return styleApply({}, sender);
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
    webNavigation.onCommitted[method](onNavigationCommitted);
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
      if (isEmptyObj(tabFrames)) {
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
    if (isEmptyObj(frameStyles)) {
      delete tabFrames[frameId];
      if (isEmptyObj(tabFrames)) {
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
}
