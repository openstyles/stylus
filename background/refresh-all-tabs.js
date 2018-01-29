/*
global API_METHODS cachedStyles
global getStyles filterStyles invalidateCache normalizeStyleSections
global updateIcon
*/
'use strict';

(() => {
  const previewFromTabs = new Map();

  /**
   * When style id and state is provided, only that style is propagated.
   * Otherwise all styles are replaced and the toolbar icon is updated.
   * @param {Object} [msg]
   * @param {{id:Number, enabled?:Boolean, sections?: (Array|String)}} [msg.style] -
   *        style to propagate
   * @param {Boolean} [msg.codeIsUpdated]
   * @returns {Promise<void>}
   */
  API_METHODS.refreshAllTabs = (msg = {}) =>
    Promise.all([
      queryTabs(),
      maybeParseUsercss(msg),
      getStyles(),
    ]).then(([tabs, style]) =>
      new Promise(resolve => {
        if (style) msg.style.sections = normalizeStyleSections(style);
        run(tabs, msg, resolve);
      }));


  function run(tabs, msg, resolve) {
    const {style, codeIsUpdated, refreshOwnTabs} = msg;

    // the style was updated/saved so we need to remove the old copy of the original style
    if (msg.method === 'styleUpdated' && msg.reason !== 'editPreview') {
      for (const [tabId, original] of previewFromTabs.entries()) {
        if (style.id === original.id) {
          previewFromTabs.delete(tabId);
        }
      }
      if (!previewFromTabs.size) {
        unregisterTabListeners();
      }
    }

    if (!style) {
      msg = {method: 'styleReplaceAll'};

    // live preview puts the code in cachedStyles, saves the original in previewFromTabs,
    // and if preview is being disabled, but the style is already deleted, we bail out
    } else if (msg.reason === 'editPreview' && !updateCache(msg)) {
      return;

    // simple style update:
    // * if disabled, apply.js will remove the element
    // * if toggled and code is unchanged, apply.js will toggle the element
    } else if (!style.enabled || codeIsUpdated === false) {
      msg = {
        method: 'styleUpdated',
        reason: msg.reason,
        style: {
          id: style.id,
          enabled: style.enabled,
        },
        codeIsUpdated,
      };

    // live preview normal operation, the new code is already in cachedStyles
    } else {
      msg.method = 'styleApply';
      msg.style = {id: msg.style.id};
    }

    if (!tabs || !tabs.length) {
      resolve();
      return;
    }

    const last = tabs[tabs.length - 1];
    for (const tab of tabs) {
      if (FIREFOX && !tab.width) continue;
      if (refreshOwnTabs === false && tab.url.startsWith(URLS.ownOrigin)) continue;
      chrome.webNavigation.getAllFrames({tabId: tab.id}, frames =>
        refreshFrame(tab, frames, msg, tab === last && resolve));
    }
  }

  function refreshFrame(tab, frames, msg, resolve) {
    ignoreChromeError();
    if (!frames || !frames.length) {
      frames = [{
        frameId: 0,
        url: tab.url,
      }];
    }
    msg.tabId = tab.id;
    const styleId = msg.style && msg.style.id;

    for (const frame of frames) {

      const styles = filterStyles({
        matchUrl: getFrameUrl(frame, frames),
        asHash: true,
        id: styleId,
      });

      msg = Object.assign({}, msg);
      msg.frameId = frame.frameId;

      if (msg.method !== 'styleUpdated') {
        msg.styles = styles;
      }

      if (msg.method === 'styleApply' && !styles.length) {
        // remove the style from a previously matching frame
        invokeOrPostpone(tab.active, sendMessage, {
          method: 'styleUpdated',
          reason: 'editPreview',
          style: {
            id: styleId,
            enabled: false,
          },
          tabId: tab.id,
          frameId: frame.frameId,
        }, ignoreChromeError);
      } else {
        invokeOrPostpone(tab.active, sendMessage, msg, ignoreChromeError);
      }

      if (!frame.frameId) {
        setTimeout(updateIcon, 0, {
          tab,
          styles: msg.method === 'styleReplaceAll' ? styles : undefined,
        });
      }
    }

    if (resolve) resolve();
  }


  function getFrameUrl(frame, frames) {
    while (frame.url === 'about:blank' && frame.frameId > 0) {
      const parent = frames.find(f => f.frameId === frame.parentFrameId);
      if (!parent) break;
      frame.url = parent.url;
      frame = parent;
    }
    return (frame || frames[0]).url;
  }


  function maybeParseUsercss({style}) {
    if (style && typeof style.sections === 'string') {
      return API_METHODS.parseUsercss({sourceCode: style.sections});
    }
  }


  function updateCache(msg) {
    const {style, tabId, restoring} = msg;
    const spoofed = !restoring && previewFromTabs.get(tabId);
    const original = cachedStyles.byId.get(style.id);

    if (style.sections && !restoring) {
      if (!previewFromTabs.size) {
        registerTabListeners();
      }
      if (!spoofed) {
        previewFromTabs.set(tabId, Object.assign({}, original));
      }

    } else {
      previewFromTabs.delete(tabId);
      if (!previewFromTabs.size) {
        unregisterTabListeners();
      }
      if (!original) {
        return;
      }
      if (!restoring) {
        msg.style = spoofed || original;
      }
    }
    invalidateCache({updated: msg.style});
    return true;
  }


  function registerTabListeners() {
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onReplaced.addListener(onTabReplaced);
    chrome.webNavigation.onCommitted.addListener(onTabNavigated);
  }


  function unregisterTabListeners() {
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    chrome.tabs.onReplaced.removeListener(onTabReplaced);
    chrome.webNavigation.onCommitted.removeListener(onTabNavigated);
  }


  function onTabRemoved(tabId) {
    const style = previewFromTabs.get(tabId);
    if (style) {
      API_METHODS.refreshAllTabs({
        style,
        tabId,
        reason: 'editPreview',
        restoring: true,
      });
    }
  }


  function onTabReplaced(addedTabId, removedTabId) {
    onTabRemoved(removedTabId);
  }


  function onTabNavigated({tabId}) {
    onTabRemoved(tabId);
  }
})();
