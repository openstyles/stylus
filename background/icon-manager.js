/* global prefs debounce iconUtil FIREFOX CHROME VIVALDI tabManager */
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

  return {updateIconBadge};

  // FIXME: in some cases, we only have to redraw the badge. is it worth a optimization?
  function updateIconBadge(tabId, count, force = true) {
    tabManager.setMeta(tabId, 'count', count);
    refreshIconBadgeText(tabId);
    refreshIcon(tabId, force);
  }

  function refreshIconBadgeText(tabId) {
    const count = tabManager.getMeta(tabId, 'count');
    iconUtil.setBadgeText({
      text: prefs.get('show-badge') && count ? String(count) : '',
      tabId
    });
  }

  function getIconName(count = 0) {
    const iconset = prefs.get('iconset') === 1 ? 'light/' : '';
    const postfix = prefs.get('disableAll') ? 'x' : !count ? 'w' : '';
    return `${iconset}$SIZE$${postfix}`;
  }

  function refreshIcon(tabId, force = false) {
    const oldIcon = tabManager.getMeta(tabId, 'icon');
    const newIcon = getIconName(tabManager.getMeta(tabId, 'count'));

    if (!force && oldIcon === newIcon) {
      return;
    }
    tabManager.setMeta(tabId, 'icon', newIcon);
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
