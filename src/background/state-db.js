import {isEmptyObj} from '/js/util';
import {safeTimeout} from './common';
import {getDbProxy} from './db';

const FLUSH_DELAY = 10e3; // ms
const idb = process.env.MV3 && getDbProxy('state', true);

/** @typedef {Map<string|number, Object>} StateDbMap */
/** @type {StateDbMap} */
export const data = process.env.MV3 && new Map();

export const ready = !process.env.MV3 ? null : Promise.all([
  idb.getAll(),
  chrome.tabs.query({}),
]).then(([dbData, tabs]) => {
  const tabsObj = {};
  for (const val of dbData) data.set(val.id, val);
  for (const tab of tabs) tabsObj[tab.id] = tab;
  return [data, tabs, tabsObj];
});

/** @type {(key: string|number) => Object} */
export const get = process.env.MV3 && data.get.bind(data);

export const set = (key, val) => {
  val.id = key;
  data.set(key, val);
  if (!timer) {
    sessionDataToWrite = {};
    timer = safeTimeout(updateSessionStorage, FLUSH_DELAY); // not debouncing for simplicity
  }
  sessionDataToWrite[key] = val;
  return val;
};

export const del = key => {
  if (data.has(key)) {
    data.delete(key);
    if (sessionDataToWrite) delete sessionDataToWrite[key];
    process.env.KEEP_ALIVE(idb.delete(key));
  }
};

let sessionDataToWrite;
let timer;

function updateSessionStorage() {
  const tmp = sessionDataToWrite;
  timer = sessionDataToWrite = null;
  if (!isEmptyObj(tmp)) { // returning the Promise for debounce->keepAlive()
    return idb.putMany(Object.values(tmp));
  }
}
