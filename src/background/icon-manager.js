import {kDisableAll, kStyleIds} from '@/js/consts';
import {__values as __prefs, subscribe} from '@/js/prefs';
import {CHROME, FIREFOX, MOBILE, VIVALDI} from '@/js/ua';
import {debounce, t} from '@/js/util';
import {ignoreChromeError, MF_ICON_EXT, MF_ICON_PATH} from '@/js/util-webext';
import * as colorScheme from './color-scheme';
import {bgBusy, bgInit, onSchemeChange, onUnload} from './common';
import {removePreloadedStyles} from './style-via-webrequest';
import tabCache, * as tabMan from './tab-manager';

const browserAction = (__.MV3 ? chrome.action : chrome.browserAction) || {};
const staleBadges = new Set();
/** @type {{ [url: string]: ImageData | Promise<ImageData> }} */
const imageDataCache = {};
const badgeOvr = {color: '', text: ''};
// https://github.com/openstyles/stylus/issues/1287 Fenix can't use custom ImageData
const FIREFOX_ANDROID = FIREFOX && MOBILE;
const ICON_SIZES =
  !__.MV3 && VIVALDI ? [19, 38] : // old Vivaldi
    __.MV3 || !FIREFOX ? [16, 32] : // Chromium
      MOBILE ? [32, 38] : // FF mobile 1x, 1.5x, 2x DPI // TODO: +48
        [16, 32, 38]; // FF desktop toolbar and panel 1x, 1.5x, 2x DPI // TODO: 38->48, +64
const kBadgeDisabled = 'badgeDisabled';
const kBadgeNormal = 'badgeNormal';
const kIconset = 'iconset';
const kShowBadge = 'show-badge';
// https://github.com/openstyles/stylus/issues/335
let hasCanvas = FIREFOX_ANDROID ? false : null;

bgInit.push(initIcons);
onSchemeChange.add(() => {
  if (__prefs[kIconset] === -1) {
    debounce(refreshGlobalIcon);
    debounce(refreshAllIcons);
  }
});

export async function refreshIconsWhenReady() {
  if (bgBusy) {
    bgInit[bgInit.indexOf(initIcons)] = 0;
    await bgBusy;
  }
  initIcons(true);
}

function initIcons(runNow = !__.MV3) {
  subscribe([
    kDisableAll,
    kBadgeDisabled,
    kBadgeNormal,
  ], () => debounce(refreshIconBadgeColor), runNow);
  subscribe([
    kShowBadge,
  ], () => debounce(refreshAllIconsBadgeText), runNow);
  subscribe([
    kDisableAll,
    kIconset,
  ], () => debounce(refreshAllIcons), runNow);
}

onUnload.add((tabId, frameId, port) => {
  if (frameId && tabCache[tabId]?.[kStyleIds]) {
    updateIconBadge.call(port, [], true);
  }
});

/**
 * @param {(number|string)[]} styleIds
 * @param {boolean} [lazyBadge] preventing flicker during page load
 * @param {number} [iid] instance id
 */
export function updateIconBadge(styleIds, lazyBadge, iid) {
  // FIXME: in some cases, we only have to redraw the badge. is it worth a optimization?
  const {tab: {id: tabId}, TDM} = this.sender;
  const frameId = TDM > 0 ? 0 : this.sender.frameId;
  const value = styleIds.length ? styleIds.map(Number) : undefined;
  tabMan.set(tabId, kStyleIds, frameId, value);
  if (iid) tabMan.set(tabId, 'iid', frameId, value && iid);
  debounce(refreshStaleBadges, frameId && lazyBadge ? 250 : 0);
  staleBadges.add(tabId);
  if (!frameId) refreshIcon(tabId, true);
  removePreloadedStyles(null, tabId + ':' + frameId);
}

  /** Calling with no params clears the override */
export function overrideBadge({text = '', color = '', title = ''} = {}) {
  if (badgeOvr.text === text) {
    return;
  }
  badgeOvr.text = text;
  badgeOvr.color = color;
  refreshIconBadgeColor();
  setBadgeText({text});
  for (let tabId in tabCache) {
    tabId = +tabId;
    if (text) {
      setBadgeText({tabId, text});
    } else {
      refreshIconBadgeText(tabId);
    }
  }
  safeCall('setTitle', {
    title: title && t(title, '', false) || title || '',
  });
}

function refreshIconBadgeText(tabId) {
  if (badgeOvr.text) return;
  const text = __prefs[kShowBadge] ? `${getStyleCount(tabId)}` : '';
  setBadgeText({tabId, text});
}

function getIconName(hasStyles = false) {
  const i = __prefs[kIconset];
  const prefix = i === 0 || i === -1 && colorScheme.isDark ? '' : 'light/';
  const postfix = __prefs[kDisableAll] ? 'x' : !hasStyles ? 'w' : '';
  return `${prefix}$SIZE$${postfix}`;
}

function refreshIcon(tabId, force = false) {
  const td = tabCache[tabId] || {};
  const oldIcon = td.icon;
  const newIcon = getIconName(td[kStyleIds]?.[0]);
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
  for (const frameData of Object.values(tabCache[tabId]?.[kStyleIds] || {}))
    frameData.forEach(allIds.add, allIds);
  return allIds.size || '';
}

// Caches imageData for icon paths
async function loadImage(url) {
  const {OffscreenCanvas} = (__.MV3 || CHROME && self.createImageBitmap) && self || {};
  const img = __.MV3 || OffscreenCanvas
    ? await createImageBitmap(await (await fetch(url)).blob())
    : await new Promise((resolve, reject) =>
      Object.assign(new Image(), {
        src: url,
        onload: e => resolve(e.target),
        onerror: reject,
      }));
  const {width: w, height: h} = img;
  const canvas = __.MV3 || OffscreenCanvas
    ? new OffscreenCanvas(w, h)
    : Object.assign($tag('canvas'), {width: w, height: h});
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
      __prefs[__prefs[kDisableAll] ? kBadgeDisabled : kBadgeNormal],
  });
}

function refreshAllIcons() {
  for (const tabId in tabCache) {
    refreshIcon(+tabId);
  }
  refreshGlobalIcon();
}

function refreshAllIconsBadgeText() {
  for (const tabId in tabCache) {
    refreshIconBadgeText(+tabId);
  }
}

function refreshStaleBadges() {
  for (const tabId of staleBadges) {
    refreshIconBadgeText(tabId);
  }
  staleBadges.clear();
}

function safeCall(method, data) {
  if (browserAction[method]) {
    try {
      // Chrome supports the callback since 67.0.3381.0, see https://crbug.com/451320
      browserAction[method](data, ignoreChromeError);
    } catch {
      // FIXME: skip pre-rendered tabs?
      browserAction[method](data);
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
