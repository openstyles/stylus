import '@/js/browser';
import * as chromeSync from '@/js/chrome-sync';
import * as prefs from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import * as STATES from '@/js/sync-util';
import {fetchWebDAV, hasOwn, t, tryURL} from '@/js/util';
import {broadcastExtension} from './broadcast';
import {bgBusy, uuidIndex} from './common';
import {db} from './db';
import {cloudDrive, dbToCloud} from './db-to-cloud-broker';
import {overrideBadge} from './icon-manager';
import * as styleMan from './style-manager';
import {onSaved} from './style-manager/fixer';
import {getByUuid} from './style-manager/util';
import {getToken, revokeToken} from './token-manager';

export {getToken};

//#region Init

const ALARM_ID = 'syncNow';
const PREF_ID = 'sync.enabled';
/** (minutes) to give the browser some time at startup to open the active tab etc. */
const SYNC_INIT_DELAY = 10 / 60;
/** (minutes) to debounce syncing after an item is uploaded/deleted. */
const SYNC_DELAY = 1;
/** (minutes) between regular sync jobs, also acts as an upper limit for SYNC_DELAY debouncing. */
const SYNC_INTERVAL = 30;
const STORAGE_KEY = 'sync/state/';
const NO_LOGIN = ['webdav'];
const status = {
  state: STATES.pending,
};
const compareRevision = (rev1, rev2) => rev1 - rev2;
let lastError = null;
let ctrl;
let curDrive;
let curDriveName;
let delayedInit;
let resolveOnSync;
let scheduling;
let syncingNow;

chrome.alarms.onAlarm.addListener(async a => {
  if (a.name === ALARM_ID) {
    if (bgBusy) await bgBusy;
    __.KEEP_ALIVE(syncNow());
  }
});
prefs.subscribe(PREF_ID, schedule, true);

//#endregion
//#region Exports

export async function remove(...args) {
  if (delayedInit) await start();
  if (!curDrive) return;
  schedule();
  return ctrl.delete(...args);
}

export function getStatus(sneaky) {
  if (delayedInit && !sneaky) start(); // not awaiting (could be slow), we'll broadcast the updates
  return status;
}

export async function login(name) {
  if (delayedInit) await start();
  if (!name) name = curDriveName;
  await revokeToken(name);
  try {
    await getToken(name, true);
    status.login = true;
  } catch (err) {
    status.login = false;
    throw err;
  } finally {
    emitStatusChange();
  }
}

export async function putDoc({_id, _rev}) {
  if (delayedInit) await start();
  if (!curDrive) return;
  schedule();
  return ctrl.put(_id, _rev);
}

export async function setDriveOptions(driveName, options) {
  const key = `secure/sync/driveOptions/${driveName}`;
  await chromeSync.set({[key]: options});
}

export async function getDriveOptions(driveName) {
  const key = `secure/sync/driveOptions/${driveName}`;
  return (await chromeSync.get(key))[key] || {};
}

export async function start(name = delayedInit) {
  const isInit = name && name === delayedInit;
  const isStop = status.state === STATES.disconnecting;
  delayedInit = false;
  if ((ctrl ??= initController()).then) ctrl = await ctrl;
  if (curDrive) return;
  curDriveName = name;
  curDrive = getDrive(name).catch(console.error); // preventing re-entry by assigning synchronously
  curDrive = await curDrive;
  ctrl.use(curDrive);
  status.state = STATES.connecting;
  status.drive = curDriveName;
  emitStatusChange();
  if (isInit || NO_LOGIN.includes(curDriveName)) {
    status.login = true;
  } else {
    try {
      await login(name);
    } catch (err) {
      console.error(err);
      setError(err);
      emitStatusChange();
      return stop();
    }
  }
  await ctrl.init();
  if (isStop) return;
  await syncNow(name);
  prefs.set(PREF_ID, name);
  status.state = STATES.connected;
  emitStatusChange();
}

export async function stop() {
  if (delayedInit) {
    status.state = STATES.disconnecting;
    try { await start(); } catch {}
  }
  if (!curDrive) return;
  status.state = STATES.disconnecting;
  emitStatusChange();
  try {
    await ctrl.uninit();
    await revokeToken(curDriveName);
    await chromeLocal.remove(STORAGE_KEY + curDriveName);
  } catch {}
  curDrive = curDriveName = null;
  prefs.set(PREF_ID, 'none');
  status.state = STATES.disconnected;
  status.drive = null;
  status.login = false;
  emitStatusChange();
}

export async function syncNow() {
  if (syncingNow) return;
  syncingNow = true;
  if (delayedInit) await start();
  if (!curDrive || !status.login) {
    console.warn('cannot sync when disconnected');
    return;
  }
  try {
    await ctrl.syncNow();
    setError();
  } catch (err) {
    err.message = translateErrorMessage(err);
    setError(err);
    if (isGrantError(err)) {
      status.login = false;
    }
  }
  if (__.MV3 && resolveOnSync) {
    resolveOnSync();
    resolveOnSync = null;
  }
  syncingNow = false;
  emitStatusChange();
}

//#endregion
//#region Utils

function initController() {
  return dbToCloud({
    onGet: _id => getByUuid(_id) || uuidIndex.custom[_id],
    async onPut(doc) {
      if (!doc) return; // TODO: delete it?
      const id = uuidIndex.get(doc._id);
      const oldCust = !id && uuidIndex.custom[doc._id];
      const oldDoc = oldCust || styleMan.get(id);
      const diff = oldDoc ? compareRevision(oldDoc._rev, doc._rev) : -1;
      if (!diff) return;
      if (diff > 0) {
        putDoc(oldDoc);
      } else if (oldCust) {
        uuidIndex.custom[doc._id] = doc;
      } else {
        delete doc.id;
        if (id) doc.id = id;
        doc.id = await db.put(doc);
        await onSaved(doc, 'sync');
      }
    },
    onDelete(_id, rev) {
      const id = uuidIndex.get(_id);
      const oldDoc = styleMan.get(id);
      return oldDoc &&
        compareRevision(oldDoc._rev, rev) <= 0 &&
        styleMan.remove(id, 'sync');
    },
    onFirstSync() {
      for (const i of Object.values(uuidIndex.custom).concat(styleMan.getAll())) {
        ctrl.put(i._id, i._rev);
      }
    },
    onProgress(e) {
      if (e.phase === 'start') {
        status.syncing = true;
      } else if (e.phase === 'end') {
        status.syncing = false;
        status.progress = null;
      } else {
        status.progress = e;
      }
      if (lastError) setError();
      emitStatusChange();
    },
    compareRevision,
    getState(drive) {
      return chromeLocal.getValue(STORAGE_KEY + drive.name);
    },
    setState(drive, state) {
      return chromeLocal.set({[STORAGE_KEY + drive.name]: state});
    },
    retryMaxAttempts: 10,
    retryExp: 1.2,
    retryDelay: 6,
  });
}

function emitStatusChange() {
  broadcastExtension({method: 'syncStatusUpdate', status});
  overrideBadge(getErrorBadge());
}

function isNetworkError(err) {
  return (
    err.name === 'TypeError' && /networkerror|failed to fetch/i.test(err.message) ||
    err.code === 502
  );
}

function isGrantError(err) {
  if (err.code === 401) return true;
  if (err.code === 400 && /invalid_grant/.test(err.message)) return true;
  if (err.name === 'TokenError') return true;
  return false;
}

function getErrorBadge() {
  if (status.state === STATES.connected &&
      (!status.login || lastError && !isNetworkError(lastError))) {
    return {
      text: 'x',
      color: '#F00',
      title: !status.login ? 'syncErrorRelogin' : `${
        t('syncError')
      }\n---------------------\n${
        // splitting to limit each line length
        lastError.message.replace(/.{60,}?\s(?=.{30,})/g, '$&\n')
      }`,
    };
  }
}

async function getDrive(name) {
  if (!hasOwn(cloudDrive, name)) throw new Error(`Unknown cloud provider: ${name}`);
  const opts = await getDriveOptions(name);
  const webdav = name === 'webdav';
  if (webdav && !tryURL(opts.url)) {
    prefs.set(PREF_ID, 'none');
    throw new Error('Broken options: WebDAV server URL is missing');
  }
  if (!__.MV3 || !webdav) opts.getAccessToken = () => getToken(name);
  if (!__.MV3 && webdav) opts.fetch = fetchWebDAV.bind(opts);
  return cloudDrive[name](opts);
}

async function schedule(isInit, prefVal = curDriveName) {
  if (scheduling) return;
  scheduling = true;
  /** @type {?chrome.alarms.Alarm} */
  const alarm = isInit && await browser.alarms.get(ALARM_ID);
  delayedInit = hasOwn(cloudDrive, prefVal) && prefVal;
  if (!delayedInit) {
    status.state = STATES.disconnected;
    if (alarm) chrome.alarms.clear(ALARM_ID);
    if (isInit) emitStatusChange();
  } else if (!alarm
    || Math.abs((alarm.periodInMinutes || 1e99) - SYNC_INTERVAL) > 1e-6
    || ((alarm.scheduledTime - Date.now()) / 60e3 + SYNC_INTERVAL) % SYNC_INTERVAL >
        (isInit ? SYNC_INTERVAL : SYNC_DELAY)
  ) {
    chrome.alarms.create(ALARM_ID, {
      delayInMinutes: isInit ? SYNC_INIT_DELAY : SYNC_DELAY,
      periodInMinutes: SYNC_INTERVAL,
    });
    if (__.MV3 && !resolveOnSync) {
      __.KEEP_ALIVE(new Promise(cb => (resolveOnSync = cb)));
    }
  }
  scheduling = false;
}

function setError(err) {
  status.errorMessage = err?.message;
  lastError = err;
}

function translateErrorMessage(err) {
  if (err.name === 'LockError') {
    return browser.i18n.getMessage('syncErrorLock',
      new Date(err.expire).toLocaleString([], {timeStyle: 'short'}));
  }
  return err.message || JSON.stringify(err);
}

//#endregion
