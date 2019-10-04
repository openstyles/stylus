/* global dbToCloud styleManager chromeLocal prefs tokenManager msg */
/* exported sync */

'use strict';

const sync = (() => {
  const SYNC_DELAY = 1;
  const SYNC_INTERVAL = 30;

  const status = {
    state: 'disconnected',
    syncing: false,
    progress: null,
    currentDriveName: null
  };
  let currentDrive;
  const ctrl = dbToCloud.dbToCloud({
    onGet(id) {
      return styleManager.getByUUID(id);
    },
    onPut(doc) {
      return styleManager.putByUUID(doc);
    },
    onDelete(id, rev) {
      return styleManager.deleteByUUID(id, rev);
    },
    onFirstSync() {
      return styleManager.getAllStyles()
        .then(styles => {
          styles.forEach(i => ctrl.put(i._id, i._rev));
        });
    },
    onProgress,
    compareRevision(a, b) {
      return styleManager.compareRevision(a, b);
    },
    getState(drive) {
      const key = `sync/state/${drive.name}`;
      return chromeLocal.get(key)
        .then(obj => obj[key]);
    },
    setState(drive, state) {
      const key = `sync/state/${drive.name}`;
      return chromeLocal.set({
        [key]: state
      });
    }
  });

  prefs.subscribe(['sync.enabled'], onPrefChange);
  onPrefChange(null, prefs.get('sync.enabled'));

  chrome.alarms.onAlarm.addListener(info => {
    if (info.name === 'syncNow') {
      ctrl.syncNow()
        .catch(handle401Error)
        .catch(console.error);
    }
  });

  return {
    start,
    stop,
    put: (...args) => {
      schedule();
      return ctrl.put(...args);
    },
    delete: (...args) => {
      schedule();
      return ctrl.delete(...args);
    },
    syncNow,
    getStatus: () => status
  };

  function onProgress(e) {
    if (e.phase === 'start') {
      status.syncing = true;
    } else if (e.phase === 'end') {
      status.syncing = false;
      status.progress = null;
    } else {
      status.progress = e;
    }
    emitStatusChange();
  }

  function schedule() {
    chrome.alarms.create('syncNow', {
      delayInMinutes: SYNC_DELAY,
      periodInMinutes: SYNC_INTERVAL
    });
  }

  function onPrefChange(key, value) {
    if (value === 'none') {
      stop().catch(console.error);
    } else {
      start(value).catch(console.error);
    }
  }

  function withFinally(p, cleanup) {
    return p.then(
      result => {
        cleanup();
        return result;
      },
      err => {
        cleanup();
        throw err;
      }
    );
  }

  function syncNow() {
    return ctrl.syncNow().catch(handle401Error);
  }

  function handle401Error(err) {
    if (err.code === 401) {
      return tokenManager.revokeToken(currentDrive.name)
        .then(() => {
          throw err;
        });
    }
    throw err;
  }

  function emitStatusChange() {
    msg.broadcastExtension({method: 'syncStatusUpdate', status});
  }

  function start(name) {
    if (currentDrive) {
      return Promise.resolve();
    }
    currentDrive = getDrive(name);
    ctrl.use(currentDrive);
    prefs.set('sync.enabled', name);
    status.state = 'connecting';
    status.currentDriveName = currentDrive.name;
    emitStatusChange();
    return withFinally(
      ctrl.start()
        .catch(err => {
          if (/Authorization page could not be loaded/i.test(err.message)) {
            // FIXME: Chrome always fail at the first login so we try again
            return ctrl.syncNow();
          }
          throw err;
        })
        .catch(handle401Error),
      () => {
        chrome.alarms.create('syncNow', {periodInMinutes: SYNC_INTERVAL});
        status.state = 'connected';
        emitStatusChange();
      }
    );
  }

  function getDrive(name) {
    if (name === 'dropbox') {
      return dbToCloud.drive.dropbox({
        getAccessToken: () => tokenManager.getToken(name)
      });
    }

    throw new Error(`unknown cloud name: ${name}`);
  }

  function stop() {
    if (!currentDrive) {
      return Promise.resolve();
    }
    chrome.alarms.clear('syncNow');
    status.state = 'disconnecting';
    emitStatusChange();
    return withFinally(
      ctrl.stop()
        .then(() => tokenManager.revokeToken(currentDrive.name))
        .then(() => chromeLocal.remove(`sync/state/${currentDrive.name}`)),
      () => {
        currentDrive = null;
        prefs.set('sync.enabled', 'none');
        status.state = 'disconnected';
        status.currentDriveName = null;
        emitStatusChange();
      }
    );
  }
})();
