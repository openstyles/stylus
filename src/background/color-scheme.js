import * as prefs from '/js/prefs';
import {debounce, isCssDarkScheme} from '/js/util';
import * as stateDb from './state-db';

const changeListeners = new Set();
const kSTATE = 'schemeSwitcher.enabled';
const kSTART = 'schemeSwitcher.nightStart';
const kEND = 'schemeSwitcher.nightEnd';
const kDark = 'dark';
const kLight = 'light';
const kNever = 'never';
const kSystem = 'system';
const kTime = 'time';
const MAP = {
  [kNever]: false,
  [kDark]: true,
  [kLight]: false,
  [kSystem]: false,
  [kTime]: false,
};
export const SCHEMES = [kDark, kLight];
/** @type {(val: !boolean) => void} */
export const setSystemDark = update.bind(null, kSystem);
export let isDark = false;
let prefState;

chrome.alarms.onAlarm.addListener(onAlarm);

prefs.subscribe(kSTATE, (_, val, firstRun) => {
  prefState = val;
  if (firstRun) {
    if (!process.env.MV3) {
      setSystemDark(isCssDarkScheme());
    } else if ((_ = stateDb.get(kDark))) {
      isDark = _[1];
      Object.assign(MAP, _[2]);
    }
  }
  if (val === kTime) {
    prefs.subscribe([kSTART, kEND], onNightChanged, true);
  } else {
    prefs.unsubscribe([kSTART, kEND], onNightChanged);
    chrome.alarms.clear(kSTART);
    chrome.alarms.clear(kEND);
  }
  update();
}, true);

export function onChange(listener, runNow) {
  changeListeners.add(listener);
  if (runNow) listener(isDark);
}

/** @param {StyleObj} _ */
export function shouldIncludeStyle({preferScheme: ps}) {
  return prefState === kNever ||
    ps !== kDark && ps !== kLight ||
    isDark === (ps === kDark);
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
    if (MAP[type] === val) return;
    MAP[type] = val;
  }
  val = MAP[prefState];
  if (isDark !== val) {
    isDark = val;
    for (const fn of changeListeners) fn(isDark);
    if (process.env.MV3) type = true;
  }
  if (process.env.MV3 && type) stateDb.set(kDark, {1: isDark, 2: MAP});
}
