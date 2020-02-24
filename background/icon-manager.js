/* global prefs debounce iconUtil FIREFOX CHROME VIVALDI tabManager navigatorUtil API_METHODS */
/* exported iconManager */
'use strict';

const iconManager = (() => {
  const ICON_SIZES = FIREFOX || CHROME >= 2883 && !VIVALDI ? [16, 32] : [19, 38];

  prefs.subscribe([
    'disableAll',
    'badgeDisabled',
    'badgeNormal',
  ], () => debounce(refreshIconBadgeColor));

  prefs.subscribe([
    'show-badge'
  ], () => debounce(refreshAllIconsBadgeText));

  prefs.subscribe([
    'disableAll',
    'iconset',
  ], () => debounce(refreshAllIcons));

  prefs.initializing.then(() => {
    refreshIconBadgeColor();
    refreshAllIconsBadgeText();
    refreshAllIcons();
  });

  Object.assign(API_METHODS, {
    /** @param {(number|string)[]} styleIds */
    updateIconBadge(styleIds) {
      // FIXME: in some cases, we only have to redraw the badge. is it worth a optimization?
      const {frameId, tab: {id: tabId}} = this.sender;
      tabManager.set(tabId, 'styleIds', frameId, styleIds.length ? styleIds.map(Number) : undefined);
      refreshIconBadgeText(tabId);
      if (!frameId) refreshIcon(tabId, true);
    },
  });

  navigatorUtil.onCommitted(({tabId, frameId}) => {
    if (!frameId) tabManager.set(tabId, 'styleIds', undefined);
  });

  function refreshIconBadgeText(tabId) {
    const text = prefs.get('show-badge') ? `${getStyleCount(tabId)}` : '';
    iconUtil.setBadgeText({tabId, text});
  }

  function getIconName(hasStyles = false) {
    const iconset = prefs.get('iconset') === 1 ? 'light/' : '';
    const postfix = prefs.get('disableAll') ? 'x' : !hasStyles ? 'w' : '';
    return `${iconset}$SIZE$${postfix}`;
  }

  function refreshIcon(tabId, force = false) {
    const oldIcon = tabManager.get(tabId, 'icon');
    const newIcon = getIconName(tabManager.get(tabId, 'styleIds', 0));
    // (changing the icon only for the main page, frameId = 0)

    if (!force && oldIcon === newIcon) {
      return;
    }
    tabManager.set(tabId, 'icon', newIcon);
    iconUtil.setIcon({
      path: getIconPath(newIcon),
      tabId
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
    const data = tabManager.get(tabId, 'styleIds') || {};
    Object.values(data).forEach(frameIds => frameIds.forEach(id => allIds.add(id)));
    return allIds.size || '';
  }

  function refreshGlobalIcon() {
    iconUtil.setIcon({
      path: getIconPath(getIconName())
    });
  }

  function refreshIconBadgeColor() {
    const color = prefs.get(prefs.get('disableAll') ? 'badgeDisabled' : 'badgeNormal');
    iconUtil.setBadgeBackgroundColor({
      color
    });
  }

  function refreshAllIcons() {
    for (const tabId of tabManager.list()) {
      refreshIcon(tabId);
    }
    refreshGlobalIcon();
  }

  function refreshAllIconsBadgeText() {
    for (const tabId of tabManager.list()) {
      refreshIconBadgeText(tabId);
    }
  }
})();
