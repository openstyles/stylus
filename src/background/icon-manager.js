import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {debounce, ignoreChromeError, MF_ICON_EXT, MF_ICON_PATH} from '/js/toolbox';
import {CHROME, FIREFOX, MOBILE, VIVALDI} from '/js/ua';
import * as colorScheme from './color-scheme';
import {bgReady} from './common';
import tabMan from './tab-manager';

const ICON_SIZES = FIREFOX || !VIVALDI ? [16, 32] : [19, 38];
const staleBadges = new Set();
/** @type {{ [url: string]: ImageData | Promise<ImageData> }} */
const imageDataCache = {};
const badgeOvr = {color: '', text: ''};
// https://github.com/openstyles/stylus/issues/1287 Fenix can't use custom ImageData
const FIREFOX_ANDROID = FIREFOX && MOBILE;
let isDark;
// https://github.com/openstyles/stylus/issues/335
let hasCanvas = FIREFOX_ANDROID ? false : null;

/**
 * @param {(number|string)[]} styleIds
 * @param {{}} opts
 * @param {boolean} [opts.lazyBadge=false] preventing flicker during page load
 * @param {string} [opts.iid] - instance id
 */
export function updateIconBadge(styleIds, {lazyBadge, iid} = {}) {
  // FIXME: in some cases, we only have to redraw the badge. is it worth a optimization?
  const {tab: {id: tabId}, TDM} = this.sender;
  const frameId = TDM > 0 ? 0 : this.sender.frameId;
  const value = styleIds.length ? styleIds.map(Number) : undefined;
  tabMan.set(tabId, 'styleIds', frameId, value);
  if (iid) tabMan.set(tabId, 'iid', frameId, iid);
  debounce(refreshStaleBadges, frameId && lazyBadge ? 250 : 0);
  staleBadges.add(tabId);
  if (!frameId) refreshIcon(tabId, true);
}

chrome.webNavigation.onCommitted.addListener(({tabId, frameId}) => {
  const ids = tabMan.getStyleIds(tabId);
  if (!ids) return;
  if (frameId) delete ids[frameId];
  else for (const id in ids) delete ids[id];
});
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'iframe') {
    port.onDisconnect.addListener(onPortDisconnected);
  }
});
colorScheme.onChange(val => {
  isDark = val;
  if (prefs.get('iconset') === -1) {
    debounce(refreshGlobalIcon);
  }
}, true);
bgReady.then(() => {
  prefs.subscribe([
    'disableAll',
    'badgeDisabled',
    'badgeNormal',
  ], () => debounce(refreshIconBadgeColor), true);
  prefs.subscribe([
    'show-badge',
  ], () => debounce(refreshAllIconsBadgeText), true);
  prefs.subscribe([
    'disableAll',
    'iconset',
  ], () => debounce(refreshAllIcons), true);
});

  /** Calling with no params clears the override */
export function overrideBadge({text = '', color = '', title = ''} = {}) {
  if (badgeOvr.text === text) {
    return;
  }
  badgeOvr.text = text;
  badgeOvr.color = color;
  refreshIconBadgeColor();
  setBadgeText({text});
  for (const tabId of tabMan.keys()) {
    if (text) {
      setBadgeText({tabId, text});
    } else {
      refreshIconBadgeText(tabId);
    }
  }
  safeCall('setTitle', {
    title: title && chrome.i18n.getMessage(title) || title || '',
  });
}

function onPortDisconnected({sender}) {
  ignoreChromeError();
  if (tabMan.getStyleIds(sender.tab.id)) {
    API.updateIconBadge.call({sender}, [], {lazyBadge: true});
  }
}

function refreshIconBadgeText(tabId) {
  if (badgeOvr.text) return;
  const text = prefs.get('show-badge') ? `${getStyleCount(tabId)}` : '';
  setBadgeText({tabId, text});
}

function getIconName(hasStyles = false) {
  const i = prefs.get('iconset');
  const prefix = i === 0 || i === -1 && isDark ? '' : 'light/';
  const postfix = prefs.get('disableAll') ? 'x' : !hasStyles ? 'w' : '';
  return `${prefix}$SIZE$${postfix}`;
}

function refreshIcon(tabId, force = false) {
  const oldIcon = tabMan.get(tabId, 'icon');
  const newIcon = getIconName(tabMan.getStyleIds(tabId)[0]);
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
      obj[size] = MF_ICON_PATH + icon.replace('$SIZE$', size) + MF_ICON_EXT;
      return obj;
    },
    {}
  );
}

/** @return {number | ''} */
function getStyleCount(tabId) {
  const allIds = new Set();
  const data = tabMan.getStyleIds(tabId) || {};
  Object.values(data).forEach(frameIds => frameIds.forEach(id => allIds.add(id)));
  return allIds.size || '';
}

// Caches imageData for icon paths
async function loadImage(url) {
  const {OffscreenCanvas} = CHROME && self.createImageBitmap && self || {};
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
  imageDataCache[url] = result;
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
  for (const tabId of tabMan.keys()) {
    refreshIcon(tabId);
  }
  refreshGlobalIcon();
}

function refreshAllIconsBadgeText() {
  for (const tabId of tabMan.keys()) {
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
  const {action = {}, browserAction = action} = chrome;
  const fn = browserAction[method];
  if (fn) {
    try {
      // Chrome supports the callback since 67.0.3381.0, see https://crbug.com/451320
      fn.call(browserAction, data, ignoreChromeError);
    } catch {
      // FIXME: skip pre-rendered tabs?
      fn.call(browserAction, data);
    }
  }
}

/** @param {chrome.browserAction.TabIconDetails} data */
async function setIcon(data) {
  if (hasCanvas == null) {
    const url = MF_ICON_PATH + ICON_SIZES[0] + MF_ICON_EXT;
    hasCanvas = imageDataCache[url] = loadImage(url);
    hasCanvas = (await hasCanvas).data.some(b => b !== 255);
  } else if (hasCanvas.then) {
    await hasCanvas;
  }
  if (hasCanvas) {
    data.imageData = {};
    for (const [key, url] of Object.entries(data.path)) {
      const val = imageDataCache[url] || (imageDataCache[url] = loadImage(url));
      data.imageData[key] = val.then ? await val : val;
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
