/* global prefs */
/* exported colorScheme */

'use strict';

const colorScheme = (() => {
  let systemPreferDark = false;
  let timePreferDark = false;
  const changeListeners = new Set();

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addListener(updateSystemPreferDark);

  const checkTime = ['schemeSwitcher.nightStart', 'schemeSwitcher.nightEnd'];
  prefs.subscribe(checkTime, (key, value) => {
    updateTimePreferDark();
    createAlarm(key, value);
  });
  checkTime.forEach(key => createAlarm(key, prefs.get(key)));

  prefs.subscribe(['schemeSwitcher.enabled'], emitChange);

  updateSystemPreferDark();
  updateTimePreferDark();

  return {shouldIncludeStyle, onChange};

  function createAlarm(key, value) {
    const date = new Date();
    applyDate(date, value);
    if (date.getTime() < Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    chrome.alarms.create(key, {
      when: date.getTime(),
      periodInMinutes: 24 * 60
    });
  }

  function shouldIncludeStyle(style) {
    if (style.preferScheme === 'always') {
      return true;
    }
    if (prefs.get('schemeSwitcher.enabled') === 'never') {
      return true;
    }
    if (prefs.get('schemeSwitcher.enabled') === 'system') {
      return systemPreferDark && style.preferScheme === 'dark' ||
        !systemPreferDark && style.preferScheme === 'light';
    }
    return timePreferDark && style.preferScheme === 'dark' ||
      !timePreferDark && style.preferScheme === 'light';
  }

  function updateSystemPreferDark() {
    const oldValue = systemPreferDark;
    systemPreferDark = media.matches;
    if (systemPreferDark !== oldValue) {
      emitChange();
    }
  }

  function updateTimePreferDark() {
    const oldValue = timePreferDark;
    const date = new Date();
    const now = date.getTime();
    applyDate(date, prefs.get('schemeSwitcher.nightStart'));
    const start = date.getTime();
    applyDate(date, prefs.get('schemeSwitcher.nightEnd'));
    const end = date.getTime();
    timePreferDark = start > end ?
      now >= start || now < end :
      now >= start && now < end;
    if (timePreferDark !== oldValue) {
      emitChange();
    }
  }

  function applyDate(date, time) {
    const [h, m] = time.split(':').map(Number);
    date.setHours(h, m, 0, 0);
  }

  function onChange(listener) {
    changeListeners.add(listener);
  }

  function emitChange() {
    for (const listener of changeListeners) {
      listener();
    }
  }
})();
