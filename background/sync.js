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

  prefs.initializing
    .then(() => {
      const provider = prefs.get('sync.enabled');
      if (provider === 'none') {
        return;
      }
      return start(provider);
    })
    .catch(console.error);

  chrome.alarms.onAlarm.addListener(info => {
    if (info.name === 'syncNow') {
      syncNow().catch(console.error);
    }
  });

  return {
    start,
    stop,
    put: ctrl.put,
    delete: ctrl.delete,
    syncNow
  };

  function syncNow() {
    return ctrl.syncNow()
      .catch(err => {
        if (err.code === 401) {
          return tokenManager.revokeToken(currentDrive.name)
            .then(() => {
              throw err;
            });
        }
        throw err;
      });
  }

  function start(name) {
    return (currentDrive ? stop() : Promise.resolve())
      .then(() => {
        currentDrive = getDrive(name);
        ctrl.use(currentDrive);
        return ctrl.start()
          .catch(err => {
            console.log(err.message);
            throw err;
          });
      })
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
    chrome.alarms.clear('syncNow');
    if (!currentDrive) {
      return Promise.resolve();
    }
    return ctrl.stop()
      .then(() => tokenManager.revokeToken(currentDrive.name))
      .then(() => chromeLocal.remove(`sync/state/${currentDrive.name}`))
      .then(() => {
        currentDrive = null;
      });
  }
})();
