/* global dbToCloud styleManager chromeLocal prefs tokenManager msg */
/* exported sync */

'use strict';

const sync = (() => {
  const SYNC_DELAY = 1; // minutes
  const SYNC_INTERVAL = 30; // minutes

  const status = {
    state: 'disconnected',
    syncing: false,
    progress: null,
    currentDriveName: null,
    errorMessage: null,
    login: false
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

  const initializing = prefs.initializing.then(() => {
    prefs.subscribe(['sync.enabled'], onPrefChange);
    onPrefChange(null, prefs.get('sync.enabled'));
  });

  chrome.alarms.onAlarm.addListener(info => {
    if (info.name === 'syncNow') {
      syncNow().catch(console.error);
    }
  });

  return Object.assign({
    getStatus: () => status
  }, ensurePrepared({
    start,
    stop,
    put: (...args) => {
      if (!currentDrive) return;
      schedule();
      return ctrl.put(...args);
    },
    delete: (...args) => {
      if (!currentDrive) return;
      schedule();
      return ctrl.delete(...args);
    },
    syncNow,
    login
  }));

  function ensurePrepared(obj) {
    return Object.entries(obj).reduce((o, [key, fn]) => {
      o[key] = (...args) =>
        initializing.then(() => fn(...args));
      return o;
    }, {});
  }

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

  function schedule(delay = SYNC_DELAY) {
    chrome.alarms.create('syncNow', {
      delayInMinutes: delay,
      periodInMinutes: SYNC_INTERVAL
    });
  }

  function onPrefChange(key, value) {
    if (value === 'none') {
      stop().catch(console.error);
    } else {
      start(value, true).catch(console.error);
    }
  }

  function withFinally(p, cleanup) {
    return p.then(
      result => {
        cleanup(undefined, result);
        return result;
      },
      err => {
        cleanup(err);
        throw err;
      }
    );
  }

  function syncNow() {
    if (!currentDrive) {
      return Promise.reject(new Error('cannot sync when disconnected'));
    }
    return withFinally(
      (ctrl.isInit() ? ctrl.syncNow() : ctrl.start())
        .catch(handle401Error),
      err => {
        status.errorMessage = err ? err.message : null;
        emitStatusChange();
      }
    );
  }

  function handle401Error(err) {
    if (err.code === 401) {
      return tokenManager.revokeToken(currentDrive.name)
        .catch(console.error)
        .then(() => {
          status.login = false;
          emitStatusChange();
          throw err;
        });
    }
    if (/User interaction required|Requires user interaction/i.test(err.message)) {
      status.login = false;
      emitStatusChange();
    }
    throw err;
  }

  function emitStatusChange() {
    msg.broadcastExtension({method: 'syncStatusUpdate', status});
  }

  function login(name = prefs.get('sync.enabled')) {
    return tokenManager.getToken(name, true)
      .catch(err => {
        if (/Authorization page could not be loaded/i.test(err.message)) {
          // FIXME: Chrome always fails at the first login so we try again
          return tokenManager.getToken(name);
        }
        throw err;
      })
      .then(() => {
        status.login = true;
        emitStatusChange();
      });
  }

  function start(name, fromPref = false) {
    if (currentDrive) {
      return Promise.resolve();
    }
    currentDrive = getDrive(name);
    ctrl.use(currentDrive);
    status.state = 'connecting';
    status.currentDriveName = currentDrive.name;
    status.login = true;
    emitStatusChange();
    return withFinally(
      (fromPref ? Promise.resolve() : login(name))
        .catch(handle401Error)
        .then(() => syncNow()),
      err => {
        // FIXME: should we move this logic to options.js?
        if (err && !fromPref) {
          console.error(err);
          return stop();
        }
        prefs.set('sync.enabled', name);
        schedule(SYNC_INTERVAL);
        status.state = 'connected';
        emitStatusChange();
      }
    );
  }

  function getDrive(name) {
    if (name === 'dropbox' || name === 'google' || name === 'onedrive') {
      return dbToCloud.drive[name]({
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
        status.login = false;
        emitStatusChange();
      }
    );
  }
})();
