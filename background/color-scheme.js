/* global prefs */
/* exported colorScheme */

'use strict';

const colorScheme = (() => {
  const changeListeners = new Set();
  const kSTATE = 'schemeSwitcher.enabled';
  const kSTART = 'schemeSwitcher.nightStart';
  const kEND = 'schemeSwitcher.nightEnd';
  const SCHEMES = ['dark', 'light'];
  const isDark = {
    never: null,
    dark: true,
    light: false,
    system: false,
    time: false,
  };
  let isDarkNow = false;

  prefs.subscribe(kSTATE, () => update());
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
    isDark: () => isDarkNow,
    /** @param {StyleObj} _ */
    shouldIncludeStyle({preferScheme: ps}) {
      return prefs.get(kSTATE) === 'never' ||
        !SCHEMES.includes(ps) ||
        isDarkNow === (ps === 'dark');
    },
    updateSystemPreferDark(val) {
      update('system', val);
      return true;
    },
  };

  function calcTime(key) {
    const [h, m] = prefs.get(key).split(':');
    return (h * 3600 + m * 60) * 1000;
  }

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
    update('time', val);
  }

  function update(type, val) {
    if (type) {
      if (isDark[type] === val) return;
      isDark[type] = val;
    }
    val = isDark[prefs.get(kSTATE)];
    if (isDarkNow !== val) {
      isDarkNow = val;
      for (const listener of changeListeners) {
        listener(isDarkNow);
      }
    }
  }
})();
