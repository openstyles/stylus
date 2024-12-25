import {kStyleViaXhr} from '@/js/consts';
import {CONNECTED} from '@/js/port';
import * as prefs from '@/js/prefs';
import {debounce, isCssDarkScheme} from '@/js/util';
import {broadcastExtension} from './broadcast';
import {bgBusy, bgInit, bgPreInit, stateDB} from './common';
import offscreen from './offscreen';

const changeListeners = new Set();
const kSTATE = 'schemeSwitcher.enabled';
const kSTART = 'schemeSwitcher.nightStart';
const kEND = 'schemeSwitcher.nightEnd';
const kDark = 'dark';
const kLight = 'light';
const kNever = 'never';
const kSystem = 'system';
const kTime = 'time';
const map = {
  [kNever]: false,
  [kDark]: true,
  [kLight]: false,
  [kSystem]: null,
  [kTime]: false,
};
export const SCHEMES = [kDark, kLight];
export const isSystem = () => prefState === kSystem;
export const refreshSystemDark = () => !__.MV3
  ? setSystemDark(isCssDarkScheme())
  : prefState === kSystem && offscreen.isDark().then(setSystemDark);
/** @type {(val: !boolean) => void} */
export const setSystemDark = update.bind(null, kSystem);
export let isDark = null;
let prefState;

chrome.alarms.onAlarm.addListener(onAlarm);

if (__.MV3) {
  bgPreInit.push(stateDB.get(kDark).then(v => {
    if (!v) {
      isDark = false;
    } else {
      isDark ??= v[0];
      Object.assign(map, v[1]);
    }
  }));
  bgInit.push(refreshSystemDark);
  prefs.subscribe([kSTATE, kStyleViaXhr], () => {
    const val = prefState === kSystem || prefs.__values[kStyleViaXhr];
    if (val || offscreen[CONNECTED]) {
      offscreen.keepAlive(val);
    }
  }, true);
} else {
  refreshSystemDark();
}

prefs.subscribe(kSTATE, (_, val) => {
  prefState = val;
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
  if (runNow) {
    if (prefState) listener(isDark);
    else prefs.ready.then(() => listener(isDark));
  }
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

async function onAlarm({name}) {
  if (name === kSTART || name === kEND) {
    if (!prefState) await prefs.ready;
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
    if (map[type] === val) return;
    map[type] = val;
  }
  val = map[prefState];
  if (isDark !== val) {
    isDark = val;
    if (!bgBusy) broadcastExtension({method: 'colorScheme', value: isDark});
    for (const fn of changeListeners) fn(isDark);
  }
}
