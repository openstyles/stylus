/* global prefs */
/* exported colorScheme */

'use strict';

const colorScheme = (() => {
  const changeListeners = new Set();
  const kSTATE = 'schemeSwitcher.enabled';
  const kSTART = 'schemeSwitcher.nightStart';
  const kEND = 'schemeSwitcher.nightEnd';
  const SCHEMES = ['dark', 'light', 'dark!', 'light!']; // ! = only if schemeSwitcher is enabled
  const isDark = {never: null, system: false, time: false};
  let isDarkNow = false;

  prefs.subscribe(kSTATE, () => emitChange());
  prefs.subscribe([kSTART, kEND], (key, value) => {
    updateTimePreferDark();
    createAlarm(key, value);
  }, {runNow: true});
  chrome.alarms.onAlarm.addListener(({name}) => {
    if (name === kSTART || name === kEND) {
      updateTimePreferDark();
    }
  });

  return {
    SCHEMES,
    onChange(listener) {
      changeListeners.add(listener);
    },
    shouldIncludeStyle({preferScheme: val}) {
      return !SCHEMES.includes(val) ||
        !val.endsWith('!') && prefs.get(kSTATE) === 'never' ||
        val.startsWith('dark') === isDarkNow;
    },
    updateSystemPreferDark(val) {
      emitChange('system', val);
      return true;
    },
  };

  function createAlarm(key, value) {
    const date = new Date();
    const [h, m] = value.split(':');
    date.setHours(h, m, 0, 0);
    if (date.getTime() < Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    chrome.alarms.create(key, {
      when: date.getTime(),
      periodInMinutes: 24 * 60,
    });
  }

  function updateTimePreferDark() {
    const now = Date.now() - new Date().setHours(0, 0, 0, 0);
    const start = calcTime(kSTART);
    const end = calcTime(kEND);
    const val = start > end ?
      now >= start || now < end :
      now >= start && now < end;
    emitChange('time', val);
  }

  function calcTime(key) {
    const [h, m] = prefs.get(key).split(':');
    return (h * 3600 + m * 60) * 1000;
  }

  function emitChange(type, val) {
    if (type) {
      if (isDark[type] === val) return;
      isDark[type] = val;
    }
    isDarkNow = isDark[prefs.get(kSTATE)];
    for (const listener of changeListeners) {
      listener(isDarkNow);
    }
  }
})();
