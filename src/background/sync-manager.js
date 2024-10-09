import browser from '/js/browser';
import * as prefs from '/js/prefs';
import {chromeLocal, chromeSync} from '/js/storage-util';
import {broadcastExtension} from './broadcast';
import {bgReady, uuidIndex} from './common';
import db from './db';
import {overrideBadge} from './icon-manager';
import * as styleMan from './style-manager';
import {getToken, revokeToken} from './token-manager';

//#region Init

const SYNC_DELAY = 1; // minutes
const SYNC_INTERVAL = 30; // minutes
const STATES = Object.freeze({
  connected: 'connected',
  connecting: 'connecting',
  disconnected: 'disconnected',
  disconnecting: 'disconnecting',
});
const STORAGE_KEY = 'sync/state/';
const NO_LOGIN = ['webdav'];
const status = /** @namespace SyncManager.Status */ {
  STATES,
  state: STATES.disconnected,
  syncing: false,
  progress: null,
  currentDriveName: null,
  errorMessage: null,
  login: false,
};
const compareRevision = (rev1, rev2) => rev1 - rev2;
let lastError = null;
let ctrl;
let currentDrive;
/** @type {Promise|boolean} will be `true` to avoid wasting a microtask tick on each `await` */
let ready = bgReady.styles.then(() => {
  ready = true;
  prefs.subscribe('sync.enabled',
    (_, val) => val === 'none'
      ? stop()
      : start(val, true),
    true);
});

chrome.alarms.onAlarm.addListener(async ({name}) => {
  if (name === 'syncNow') {
    await syncNow();
  }
});

//#endregion
//#region Exports

export async function remove(...args) {
  if (ready.then) await ready;
  if (!currentDrive) return;
  schedule();
  return ctrl.delete(...args);
}

/** @returns {Promise<SyncManager.Status>} */
export async function getStatus() {
  return status;
}

export async function login(name) {
  if (ready.then) await ready;
  if (!name) name = prefs.get('sync.enabled');
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
  if (ready.then) await ready;
  if (!currentDrive) return;
  schedule();
  return ctrl.put(_id, _rev);
}

export async function setDriveOptions(driveName, options) {
  const key = `secure/sync/driveOptions/${driveName}`;
  await chromeSync.setValue(key, options);
}

export async function getDriveOptions(driveName) {
  const key = `secure/sync/driveOptions/${driveName}`;
  return await chromeSync.getValue(key) || {};
}

export async function start(name, fromPref = false) {
  if (ready.then) await ready;
  if (!ctrl) await initController();

  if (currentDrive) return;
  currentDrive = await getDrive(name);
  ctrl.use(currentDrive);

  status.state = STATES.connecting;
  status.currentDriveName = currentDrive.name;
  emitStatusChange();

  if (fromPref || NO_LOGIN.includes(currentDrive.name)) {
    status.login = true;
  } else {
    try {
      await login(name);
    } catch (err) {
      console.error(err);
      status.errorMessage = err.message;
      lastError = err;
      emitStatusChange();
      return stop();
    }
  }

  await ctrl.init();

  await syncNow(name);
  prefs.set('sync.enabled', name);
  status.state = STATES.connected;
  schedule(SYNC_INTERVAL);
  emitStatusChange();
}

export async function stop() {
  if (ready.then) await ready;
  if (!currentDrive) return;
  chrome.alarms.clear('syncNow');
  status.state = STATES.disconnecting;
  emitStatusChange();
  try {
    await ctrl.uninit();
    await revokeToken(currentDrive.name);
    await chromeLocal.remove(STORAGE_KEY + currentDrive.name);
  } catch (e) {
  }
  currentDrive = null;
  prefs.set('sync.enabled', 'none');
  status.state = STATES.disconnected;
  status.currentDriveName = null;
  status.login = false;
  emitStatusChange();
}

export async function syncNow() {
  if (ready.then) await ready;
  if (!currentDrive || !status.login) {
    console.warn('cannot sync when disconnected');
    return;
  }
  try {
    await ctrl.syncNow();
    status.errorMessage = null;
    lastError = null;
  } catch (err) {
    err.message = translateErrorMessage(err);
    status.errorMessage = err.message;
    lastError = err;
    if (isGrantError(err)) {
      status.login = false;
    }
  }
  emitStatusChange();
}

//#endregion
//#region Utils

async function initController() {
  ctrl = (await import('./sync-deps')).dbToCloud({
    onGet: _id => styleMan.uuid2style(_id) || uuidIndex.custom[_id],
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
        await styleMan.handleSave(doc, 'sync');
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
      emitStatusChange();
    },
    compareRevision,
    getState(drive) {
      return chromeLocal.getValue(STORAGE_KEY + drive.name);
    },
    setState(drive, state) {
      return chromeLocal.setValue(STORAGE_KEY + drive.name, state);
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
        chrome.i18n.getMessage('syncError')
      }\n---------------------\n${
        // splitting to limit each line length
        lastError.message.replace(/.{60,}?\s(?=.{30,})/g, '$&\n')
      }`,
    };
  }
}

async function getDrive(name) {
  if (name === 'dropbox' || name === 'google' || name === 'onedrive' || name === 'webdav') {
    const options = await getDriveOptions(name);
    options.getAccessToken = () => getToken(name);
    options.fetch = name === 'webdav' ? fetchWebDAV.bind(options) : fetch;
    return (await import('./sync-deps')).drive[name](options);
  }
  throw new Error(`unknown cloud name: ${name}`);
}

/** @this {Object} DriveOptions */
function fetchWebDAV(url, init = {}) {
  init.credentials = 'omit'; // circumventing nextcloud CSRF token error
  init.headers = Object.assign({}, init.headers, {
    Authorization: `Basic ${btoa(`${this.username || ''}:${this.password || ''}`)}`,
  });
  return fetch(url, init);
}

function schedule(delay = SYNC_DELAY) {
  chrome.alarms.create('syncNow', {
    delayInMinutes: delay, // fractional values are supported
    periodInMinutes: SYNC_INTERVAL,
  });
}

function translateErrorMessage(err) {
  if (err.name === 'LockError') {
    return browser.i18n.getMessage('syncErrorLock',
      new Date(err.expire).toLocaleString([], {timeStyle: 'short'}));
  }
  return err.message || String(err);
}

//#endregion
