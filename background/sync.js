/* global dbToCloud styleManager chromeLocal prefs tokenManager loadScript */
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
      ctrl.syncNow().catch(console.error);
    }
  });

  return {
    start,
    stop,
    put: ctrl.put,
    delete: ctrl.delete
  };

  function start(name) {
    return (currentDrive ? stop() : Promise.resolve())
      .then(() => {
        if (currentDrive) {
          return chromeLocal.remove(`sync/state/${currentDrive.name}`);
        }
      })
      .then(() => {
        currentDrive = getDrive(name);
        ctrl.use(currentDrive);
        return ctrl.start();
      })
      .then(() => {
        chrome.alarms.create('syncNow', {periodInMinutes: 30});
      });
  }

  function getDrive(name) {
    if (name === 'dropbox') {
      return dbToCloud.drive.dropbox({
        getAccessToken: dbx => tokenManager.getToken(name, dbx),
        getDropbox: () => loadScript('/vendor/dropbox/dropbox-sdk.js')
          .then(() => Dropbox.Dropbox), // eslint-disable-line no-undef
        clientId: tokenManager.getClientId('dropbox')
      });
    }

    throw new Error(`unknown cloud name: ${name}`);
  }

  function stop() {
    chrome.alarms.clear('syncNow');
    return ctrl.stop();
  }
})();
