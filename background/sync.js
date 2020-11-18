/* global
  API
  chromeLocal
  dbToCloud
  msg
  prefs
  styleManager
  tokenManager
*/
/* exported sync */

'use strict';

const sync = API.sync = (() => {
  const SYNC_DELAY = 1; // minutes
  const SYNC_INTERVAL = 30; // minutes

  /** @typedef API.sync.Status */
  const status = {
    /** @type {'connected'|'connecting'|'disconnected'|'disconnecting'} */
    state: 'disconnected',
    syncing: false,
    progress: null,
    currentDriveName: null,
    errorMessage: null,
    login: false,
  };
  let currentDrive;
  const ctrl = dbToCloud.dbToCloud({
    onGet(id) {
      return API.styles.getByUUID(id);
    },
    onPut(doc) {
      return API.styles.putByUUID(doc);
    },
    onDelete(id, rev) {
      return API.styles.deleteByUUID(id, rev);
    },
    async onFirstSync() {
      for (const i of await API.styles.getAll()) {
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
    compareRevision(a, b) {
      return styleManager.compareRevision(a, b);
    },
    getState(drive) {
      const key = `sync/state/${drive.name}`;
      return chromeLocal.getValue(key);
    },
    setState(drive, state) {
      const key = `sync/state/${drive.name}`;
      return chromeLocal.setValue(key, state);
    },
  });

  const ready = prefs.initializing.then(() => {
    prefs.subscribe('sync.enabled',
      (_, val) => val === 'none'
        ? sync.stop()
        : sync.start(val, true),
      {now: true});
  });

  chrome.alarms.onAlarm.addListener(info => {
    if (info.name === 'syncNow') {
      sync.syncNow();
    }
  });

  // Sorted alphabetically
  return {

    async delete(...args) {
      await ready;
      if (!currentDrive) return;
      schedule();
      return ctrl.delete(...args);
    },

    /**
     * @returns {Promise<API.sync.Status>}
     */
    async getStatus() {
      return status;
    },

    async login(name = prefs.get('sync.enabled')) {
      await ready;
      try {
        await tokenManager.getToken(name, true);
      } catch (err) {
        if (/Authorization page could not be loaded/i.test(err.message)) {
          // FIXME: Chrome always fails at the first login so we try again
          await tokenManager.getToken(name);
        }
        throw err;
      }
      status.login = true;
      emitStatusChange();
    },

    async put(...args) {
      await ready;
      if (!currentDrive) return;
      schedule();
      return ctrl.put(...args);
    },

    async start(name, fromPref = false) {
      await ready;
      if (currentDrive) {
        return;
      }
      currentDrive = getDrive(name);
      ctrl.use(currentDrive);
      status.state = 'connecting';
      status.currentDriveName = currentDrive.name;
      status.login = true;
      emitStatusChange();
      try {
        if (!fromPref) {
          await sync.login(name).catch(handle401Error);
        }
        await sync.syncNow();
        status.errorMessage = null;
      } catch (err) {
        status.errorMessage = err.message;
        // FIXME: should we move this logic to options.js?
        if (!fromPref) {
          console.error(err);
          return sync.stop();
        }
      }
      prefs.set('sync.enabled', name);
      status.state = 'connected';
      schedule(SYNC_INTERVAL);
      emitStatusChange();
    },

    async stop() {
      await ready;
      if (!currentDrive) {
        return;
      }
      chrome.alarms.clear('syncNow');
      status.state = 'disconnecting';
      emitStatusChange();
      try {
        await ctrl.stop();
        await tokenManager.revokeToken(currentDrive.name);
        await chromeLocal.remove(`sync/state/${currentDrive.name}`);
      } catch (e) {
      }
      currentDrive = null;
      prefs.set('sync.enabled', 'none');
      status.state = 'disconnected';
      status.currentDriveName = null;
      status.login = false;
      emitStatusChange();
    },

    async syncNow() {
      await ready;
      if (!currentDrive) {
        return Promise.reject(new Error('cannot sync when disconnected'));
      }
      try {
        await (ctrl.isInit() ? ctrl.syncNow() : ctrl.start()).catch(handle401Error);
        status.errorMessage = null;
      } catch (err) {
        status.errorMessage = err.message;
      }
      emitStatusChange();
    },
  };

  function schedule(delay = SYNC_DELAY) {
    chrome.alarms.create('syncNow', {
      delayInMinutes: delay,
      periodInMinutes: SYNC_INTERVAL,
    });
  }

  async function handle401Error(err) {
    let emit;
    if (err.code === 401) {
      await tokenManager.revokeToken(currentDrive.name).catch(console.error);
      emit = true;
    } else if (/User interaction required|Requires user interaction/i.test(err.message)) {
      emit = true;
    }
    if (emit) {
      status.login = false;
      emitStatusChange();
    }
    return Promise.reject(err);
  }

  function emitStatusChange() {
    msg.broadcastExtension({method: 'syncStatusUpdate', status});
  }

  function getDrive(name) {
    if (name === 'dropbox' || name === 'google' || name === 'onedrive') {
      return dbToCloud.drive[name]({
        getAccessToken: () => tokenManager.getToken(name),
      });
    }
    throw new Error(`unknown cloud name: ${name}`);
  }
})();
