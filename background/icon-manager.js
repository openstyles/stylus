/* global API */// msg.js
/* global addAPI bgReady */// common.js
/* global prefs */
/* global tabMan */
/* global CHROME FIREFOX VIVALDI debounce ignoreChromeError */// toolbox.js
'use strict';

/* exported iconMan */
const iconMan = (() => {
  const ICON_SIZES = FIREFOX || CHROME >= 55 && !VIVALDI ? [16, 32] : [19, 38];
  const staleBadges = new Set();
  const imageDataCache = new Map();
  const badgeOvr = {color: '', text: ''};
  // https://github.com/openstyles/stylus/issues/335
  let hasCanvas = loadImage(`/images/icon/${ICON_SIZES[0]}.png`)
    .then(({data}) => (hasCanvas = data.some(b => b !== 255)));

  addAPI(/** @namespace API */ {
  /**
   * @param {(number|string)[]} styleIds
   * @param {boolean} [lazyBadge=false] preventing flicker during page load
   */
    updateIconBadge(styleIds, {lazyBadge} = {}) {
      // FIXME: in some cases, we only have to redraw the badge. is it worth a optimization?
      const {frameId, tab: {id: tabId}} = this.sender;
      const value = styleIds.length ? styleIds.map(Number) : undefined;
      tabMan.set(tabId, 'styleIds', frameId, value);
      debounce(refreshStaleBadges, frameId && lazyBadge ? 250 : 0);
      staleBadges.add(tabId);
      if (!frameId) refreshIcon(tabId, true);
    },
  });

  chrome.webNavigation.onCommitted.addListener(({tabId, frameId}) => {
    if (!frameId) tabMan.set(tabId, 'styleIds', undefined);
  });

  chrome.runtime.onConnect.addListener(port => {
    if (port.name === 'iframe') {
      port.onDisconnect.addListener(onPortDisconnected);
    }
  });

  bgReady.all.then(() => {
    prefs.subscribe([
      'disableAll',
      'badgeDisabled',
      'badgeNormal',
    ], () => debounce(refreshIconBadgeColor), {runNow: true});
    prefs.subscribe([
      'show-badge',
    ], () => debounce(refreshAllIconsBadgeText), {runNow: true});
    prefs.subscribe([
      'disableAll',
      'iconset',
    ], () => debounce(refreshAllIcons), {runNow: true});
  });

  return {
    /** Calling with no params clears the override */
    overrideBadge({text = '', color = '', title = ''} = {}) {
      if (badgeOvr.text === text) {
        return;
      }
      badgeOvr.text = text;
      badgeOvr.color = color;
      refreshIconBadgeColor();
      setBadgeText({text});
      for (const tabId of tabMan.list()) {
        if (text) {
          setBadgeText({tabId, text});
        } else {
          refreshIconBadgeText(tabId);
        }
      }
      chrome.browserAction.setTitle({
        title: title && chrome.i18n.getMessage(title) || title || '',
      });
    },
  };

  function onPortDisconnected({sender}) {
    if (tabMan.get(sender.tab.id, 'styleIds')) {
      API.updateIconBadge.call({sender}, [], {lazyBadge: true});
    }
  }

  function refreshIconBadgeText(tabId) {
    if (badgeOvr.text) return;
    const text = prefs.get('show-badge') ? `${getStyleCount(tabId)}` : '';
    setBadgeText({tabId, text});
  }

  function getIconName(hasStyles = false) {
    const iconset = prefs.get('iconset') === 1 ? 'light/' : '';
    const postfix = prefs.get('disableAll') ? 'x' : !hasStyles ? 'w' : '';
    return `${iconset}$SIZE$${postfix}`;
  }

  function refreshIcon(tabId, force = false) {
    const oldIcon = tabMan.get(tabId, 'icon');
    const newIcon = getIconName(tabMan.get(tabId, 'styleIds', 0));
    // (changing the icon only for the main page, frameId = 0)

    if (!force && oldIcon === newIcon) {
      return;
    }
    tabMan.set(tabId, 'icon', newIcon);
    setIcon({
      path: getIconPath(newIcon),
      tabId,
    });
  }

  function getIconPath(icon) {
    return ICON_SIZES.reduce(
      (obj, size) => {
        obj[size] = `/images/icon/${icon.replace('$SIZE$', size)}.png`;
        return obj;
      },
      {}
    );
  }

  /** @return {number | ''} */
  function getStyleCount(tabId) {
    const allIds = new Set();
    const data = tabMan.get(tabId, 'styleIds') || {};
    Object.values(data).forEach(frameIds => frameIds.forEach(id => allIds.add(id)));
    return allIds.size || '';
  }

  // Caches imageData for icon paths
  async function loadImage(url) {
    const {OffscreenCanvas} = !FIREFOX && self.createImageBitmap && self || {};
    const img = OffscreenCanvas
      ? await createImageBitmap(await (await fetch(url)).blob())
      : await new Promise((resolve, reject) =>
        Object.assign(new Image(), {
          src: url,
          onload: e => resolve(e.target),
          onerror: reject,
        }));
    const {width: w, height: h} = img;
    const canvas = OffscreenCanvas
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), {width: w, height: h});
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const result = ctx.getImageData(0, 0, w, h);
    imageDataCache.set(url, result);
    return result;
  }

  function refreshGlobalIcon() {
    setIcon({
      path: getIconPath(getIconName()),
    });
  }

  function refreshIconBadgeColor() {
    setBadgeBackgroundColor({
      color: badgeOvr.color ||
        prefs.get(prefs.get('disableAll') ? 'badgeDisabled' : 'badgeNormal'),
    });
  }

  function refreshAllIcons() {
    for (const tabId of tabMan.list()) {
      refreshIcon(tabId);
    }
    refreshGlobalIcon();
  }

  function refreshAllIconsBadgeText() {
    for (const tabId of tabMan.list()) {
      refreshIconBadgeText(tabId);
    }
  }

  function refreshStaleBadges() {
    for (const tabId of staleBadges) {
      refreshIconBadgeText(tabId);
    }
    staleBadges.clear();
  }

  function safeCall(method, data) {
    const {browserAction = {}} = chrome;
    const fn = browserAction[method];
    if (fn) {
      try {
        // Chrome supports the callback since 67.0.3381.0, see https://crbug.com/451320
        fn.call(browserAction, data, ignoreChromeError);
      } catch (e) {
        // FIXME: skip pre-rendered tabs?
        fn.call(browserAction, data);
      }
    }
  }

  /** @param {chrome.browserAction.TabIconDetails} data */
  async function setIcon(data) {
    if (hasCanvas === true || await hasCanvas) {
      data.imageData = {};
      for (const [key, url] of Object.entries(data.path)) {
        data.imageData[key] = imageDataCache.get(url) || await loadImage(url);
      }
      delete data.path;
    }
    safeCall('setIcon', data);
  }

  /** @param {chrome.browserAction.BadgeTextDetails} data */
  function setBadgeText(data) {
    safeCall('setBadgeText', data);
  }

  /** @param {chrome.browserAction.BadgeBackgroundColorDetails} data */
  function setBadgeBackgroundColor(data) {
    safeCall('setBadgeBackgroundColor', data);
  }
})();
