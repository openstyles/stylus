/* global API msg */// msg.js
/* global bgReady uuidIndex */// common.js
/* global chromeLocal chromeSync */// storage-util.js
/* global db */
/* global iconMan */
/* global prefs */
/* global styleUtil */
/* global tokenMan */
'use strict';

const syncMan = (() => {
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
        ? syncMan.stop()
        : syncMan.start(val, true),
      {runNow: true});
  });

  chrome.alarms.onAlarm.addListener(async ({name}) => {
    if (name === 'syncNow') {
      await syncMan.syncNow();
    }
  });

  //#endregion
  //#region Exports

  return {

    async delete(...args) {
      if (ready.then) await ready;
      if (!currentDrive) return;
      schedule();
      return ctrl.delete(...args);
    },

    /** @returns {Promise<SyncManager.Status>} */
    async getStatus() {
      return status;
    },

    async login(name) {
      if (ready.then) await ready;
      if (!name) name = prefs.get('sync.enabled');
      await tokenMan.revokeToken(name);
      try {
        await tokenMan.getToken(name, true);
        status.login = true;
      } catch (err) {
        status.login = false;
        throw err;
      } finally {
        emitStatusChange();
      }
    },

    async putDoc({_id, _rev}) {
      if (ready.then) await ready;
      if (!currentDrive) return;
      schedule();
      return ctrl.put(_id, _rev);
    },

    async setDriveOptions(driveName, options) {
      const key = `secure/sync/driveOptions/${driveName}`;
      await chromeSync.setValue(key, options);
    },

    async getDriveOptions(driveName) {
      const key = `secure/sync/driveOptions/${driveName}`;
      return await chromeSync.getValue(key) || {};
    },

    async start(name, fromPref = false) {
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
          await syncMan.login(name);
        } catch (err) {
          console.error(err);
          status.errorMessage = err.message;
          lastError = err;
          emitStatusChange();
          return syncMan.stop();
        }
      }

      await ctrl.init();

      await syncMan.syncNow(name);
      prefs.set('sync.enabled', name);
      status.state = STATES.connected;
      schedule(SYNC_INTERVAL);
      emitStatusChange();
    },

    async stop() {
      if (ready.then) await ready;
      if (!currentDrive) return;
      chrome.alarms.clear('syncNow');
      status.state = STATES.disconnecting;
      emitStatusChange();
      try {
        await ctrl.uninit();
        await tokenMan.revokeToken(currentDrive.name);
        await chromeLocal.remove(STORAGE_KEY + currentDrive.name);
      } catch (e) {}
      currentDrive = null;
      prefs.set('sync.enabled', 'none');
      status.state = STATES.disconnected;
      status.currentDriveName = null;
      status.login = false;
      emitStatusChange();
    },

    async syncNow() {
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
    },
  };

  //#endregion
  //#region Utils

  async function initController() {
    await require(['/vendor/db-to-cloud/db-to-cloud.min']); /* global dbToCloud */
    ctrl = dbToCloud.dbToCloud({
      onGet: styleUtil.uuid2style,
      async onPut(doc) {
        const id = uuidIndex.get(doc._id);
        const oldCust = uuidIndex.custom[id];
        const oldDoc = oldCust || styleUtil.id2style(id);
        const diff = oldDoc ? compareRevision(oldDoc._rev, doc._rev) : -1;
        if (!diff) return;
        if (diff > 0) {
          syncMan.putDoc(oldDoc);
        } else if (oldCust) {
          uuidIndex.custom[id] = doc;
        } else {
          delete doc.id;
          if (id) doc.id = id;
          doc.id = await db.styles.put(doc);
          await styleUtil.handleSave(doc, {reason: 'sync'});
        }
      },
      onDelete(_id, rev) {
        const id = uuidIndex.get(_id);
        const oldDoc = styleUtil.id2style(id);
        return oldDoc &&
          compareRevision(oldDoc._rev, rev) <= 0 &&
          API.styles.delete(id, 'sync');
      },
      async onFirstSync() {
        for (const i of Object.values(uuidIndex.custom).concat(await API.styles.getAll())) {
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
    msg.broadcastExtension({method: 'syncStatusUpdate', status});
    iconMan.overrideBadge(getErrorBadge());
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
      const options = await syncMan.getDriveOptions(name);
      options.getAccessToken = () => tokenMan.getToken(name);
      return dbToCloud.drive[name](options);
    }
    throw new Error(`unknown cloud name: ${name}`);
  }

  function schedule(delay = SYNC_DELAY) {
    chrome.alarms.create('syncNow', {
      delayInMinutes: delay, // fractional values are supported
      periodInMinutes: SYNC_INTERVAL,
    });
  }

  function translateErrorMessage(err) {
    if (err.name === 'LockError') {
      return browser.i18n.getMessage('syncErrorLock', new Date(err.expire).toLocaleString([], {timeStyle: 'short'}));
    }
    return err.message || String(err);
  }

  //#endregion
})();
