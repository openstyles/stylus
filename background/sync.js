/* global dbToCloud styleManager chromeLocal prefs tokenManager msg */
/* exported sync */

'use strict';

const sync = (() => {
  const status = {
    state: 'disconnected',
    syncing: false,
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
    put: ctrl.put,
    delete: ctrl.delete,
    syncNow,
    getStatus: () => status
  };

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
    if (status.syncing) {
      return Promise.reject(new Error('still syncing'));
    }
    status.syncing = true;
    emitChange();
    return withFinally(
      ctrl.syncNow().catch(handle401Error),
      () => {
        status.syncing = false;
        emitChange();
      }
    );
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

  function emitChange() {
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
    emitChange();
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
        chrome.alarms.create('syncNow', {periodInMinutes: 30});
        status.state = 'connected';
        emitChange();
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
    emitChange();
    return withFinally(
      ctrl.stop()
        .then(() => tokenManager.revokeToken(currentDrive.name))
        .then(() => chromeLocal.remove(`sync/state/${currentDrive.name}`)),
      () => {
        currentDrive = null;
        prefs.set('sync.enabled', 'none');
        status.state = 'disconnected';
        status.currentDriveName = null;
        emitChange();
      }
    );
  }
})();
