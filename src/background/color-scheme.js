import * as prefs from '/js/prefs';
import {debounce, isCssDarkScheme} from '/js/toolbox';

const changeListeners = new Set();
const kSTATE = 'schemeSwitcher.enabled';
const kSTART = 'schemeSwitcher.nightStart';
const kEND = 'schemeSwitcher.nightEnd';
const kDark = 'dark';
const kLight = 'light';
const kNever = 'never';
const kSystem = 'system';
const kTime = 'time';
const mode = {
  [kNever]: null,
  [kDark]: true,
  [kLight]: false,
  [kSystem]: false,
  [kTime]: false,
};
export const SCHEMES = [kDark, kLight];
/** @type {(val: !boolean) => void} */
export const setSystemDark = update.bind(null, kSystem);
let isDarkNow = false;
if (!process.env.MV3) {
  setSystemDark(isCssDarkScheme());
}
prefs.subscribe(kSTATE, (_, val) => {
  if (val === kTime) {
    prefs.subscribe([kSTART, kEND], onNightChanged, true);
    chrome.alarms.onAlarm.addListener(onAlarm);
  } else if (chrome.alarms.onAlarm.hasListener(onAlarm)) {
    prefs.unsubscribe([kSTART, kEND], onNightChanged);
    chrome.alarms.onAlarm.removeListener(onAlarm);
    chrome.alarms.clear(kSTART);
    chrome.alarms.clear(kEND);
  }
  update();
}, true);

export function onChange(listener, runNow) {
  changeListeners.add(listener);
  if (runNow) listener(isDarkNow);
}

export function isDark() {
  return isDarkNow;
}

/** @param {StyleObj} _ */
export function shouldIncludeStyle({preferScheme: ps}) {
  return prefs.get(kSTATE) === kNever ||
    !SCHEMES.includes(ps) ||
    isDarkNow === (ps === kDark);
}

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

function onAlarm({name}) {
  if (name === kSTART || name === kEND) {
    updateTimePreferDark();
  }
}

function onNightChanged(force) {
  if (force !== true) return debounce(onNightChanged, 0, true);
  updateTimePreferDark();
  // recreating both alarms as the user may have been in a different timezone when setting the other one
  createAlarm(kSTART, prefs.get(kSTART));
  createAlarm(kEND, prefs.get(kEND));
}

function updateTimePreferDark() {
  const now = Date.now() - new Date().setHours(0, 0, 0, 0);
  const start = calcTime(kSTART);
  const end = calcTime(kEND);
  const val = start > end ?
    now >= start || now < end :
    now >= start && now < end;
  update(kTime, val);
}

function update(type, val) {
  if (type) {
    if (mode[type] === val) return;
    mode[type] = val;
  }
  val = mode[prefs.get(kSTATE)];
  if (isDarkNow !== val) {
    isDarkNow = val;
    for (const listener of changeListeners) {
      listener(isDarkNow);
    }
  }
}
