/* global dbToCloud styleManager chromeLocal prefs tokenManager */
/* exported sync */

'use strict';

const sync = (() => {
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

  prefs.subscribe(['sync.enabled'], (key, value) => {
    if (value === 'none') {
      stop().catch(console.error);
    } else {
      start(value).catch(console.error);
    }
  });

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
    syncNow: () => ctrl.syncNow().catch(handle401Error)
  };

  function handle401Error(err) {
    if (err.code === 401) {
      return tokenManager.revokeToken(currentDrive.name)
        .then(() => {
          throw err;
        });
    }
    throw err;
  }

  function start(name) {
    if (currentDrive) {
      return Promise.resolve();
    }
    currentDrive = getDrive(name);
    ctrl.use(currentDrive);
    prefs.set('sync.enabled', name);
    return ctrl.start()
      .catch(err => {
        if (/Authorization page could not be loaded/i.test(err.message)) {
          // FIXME: Chrome always fail at the first login so we try again
          return ctrl.syncNow();
        }
        throw err;
      })
      .catch(handle401Error)
      .then(() => {
        chrome.alarms.create('syncNow', {periodInMinutes: 30});
      });
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
    return ctrl.stop()
      .then(() => tokenManager.revokeToken(currentDrive.name))
      .then(() => chromeLocal.remove(`sync/state/${currentDrive.name}`))
      .then(() => {
        currentDrive = null;
        prefs.set('sync.enabled', 'none');
      });
  }
})();
