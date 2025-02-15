import {BIT_DARK, BIT_SYS_DARK, kDark} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {debounce, isCssDarkScheme} from '@/js/util';
import {broadcastExtension} from './broadcast';
import {bgBusy, bgPreInit, onSchemeChange} from './common';
import {stateDB} from './db';
import offscreen from './offscreen';

const kSTATE = 'schemeSwitcher.enabled';
const kSTART = 'schemeSwitcher.nightStart';
const kEND = 'schemeSwitcher.nightEnd';
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
let saved;
let notified;
let timer;

chrome.alarms.onAlarm.addListener(onAlarm);

if (__.MV3) {
  bgPreInit.push(stateDB.get(kDark).then(val => {
    __.DEBUGLOG('colorScheme stateDB', val);
    saved = +val;
    if (typeof val === 'number') {
      notified = isDark = !!(val & BIT_DARK);
      map[kSystem] ??= !!(val & BIT_SYS_DARK); // e.g. clientDataJob did it
      update();
    }
  }));
} else {
  saved = true;
  refreshSystemDark();
}

prefs.subscribe(kSTATE, (_, val) => {
  __.DEBUGLOG('colorScheme pref', val);
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

/** @param {StyleObj} _ */
export function shouldIncludeStyle({preferScheme: ps}) {
  return prefState === kNever ||
    ps !== kDark && ps !== kLight ||
    isDark === (ps === kDark);
}

function calcTime(key) {
  const [h, m] = prefs.__values[key].split(':');
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
  createAlarm(kSTART, prefs.__values[kSTART]);
  createAlarm(kEND, prefs.__values[kEND]);
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
  __.DEBUGLOG('colorScheme update', type, val);
  if (type) {
    if (map[type] === val) return;
    if (__.MV3 && type === kSystem)
      timer ??= setTimeout(writeState);
    map[type] = val;
    if (!prefState) return; // setClientData woke SW up, still starting
  }
  val = map[prefState];
  if (isDark !== val) {
    isDark = val;
    if (isDark !== notified && saved != null)
      debounce(notify);
  }
}

function notify() {
  __.DEBUGLOG('colorScheme notify', isDark);
  notified = isDark;
  broadcastExtension({method: 'colorScheme', value: isDark});
  for (const fn of onSchemeChange) fn(isDark);
}

async function writeState() {
  if (bgBusy) await bgBusy;
  const val = (isDark ? BIT_DARK : 0) + (map[kSystem] ? BIT_SYS_DARK : 0);
  if (saved !== val)
    stateDB.put(saved = val, kDark);
  timer = null;
}
