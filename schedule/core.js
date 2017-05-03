/* globals getStylesSafe, saveStyleSafe, BG */
'use strict';

var SCHEDULE_PREFIX = 'schedule';

var schedule = {};

schedule.prefs = {
  get (name, callback) {
    chrome.storage.local.get(name, callback);
  },
  getAll (callback) {
    schedule.prefs.get(null, prefs => {
      callback(
        Object.keys(prefs).filter(n => n.startsWith(SCHEDULE_PREFIX + '.'))
        .map(n => [n, prefs[n]])
      );
    });
  },
  set (name, value, callback = () => {}) {
    chrome.storage.local.set({
      [name]: value
    }, callback);
  },
  remove (name) {
    chrome.storage.local.remove(name);
  },
  subscribe (callback) {
    chrome.storage.onChanged.addListener(prefs => {
      Object.keys(prefs)
        .filter(n => prefs[n].newValue)
        .forEach(n => callback(n, prefs[n].newValue));
    });
  }
};

schedule.entry = request => {
  console.error('schedule.entry', request);
  return new Promise((resolve, reject) => {
    chrome.permissions.request({
      permissions: ['idle', 'alarms']
    }, (granted) => {
      if (granted) {
        schedule.prefs.set(SCHEDULE_PREFIX + '.' + request.id, {
          id: request.id,
          start: request.start,
          end: request.end,
          enabled: request.enabled
        });
        resolve();
      }
      else {
        reject(new Error('Required permissions are not granted'));
      }
    });
  });
};

schedule.execute = (name, request) => {
  console.error('schedule.execute', name, request);
  chrome.alarms.clear(name, () => {
    if (request.enabled) {
      const now = new Date();
      let start = new Date(now.toDateString() + ' ' + request.start).getTime() - now;
      let end = new Date(now.toDateString() + ' ' + request.end).getTime() - now;
      console.error('next alarm is set for', request.id);
      chrome.alarms.create(name, {
        when: now.getTime() + Math.min(
          start < 0 ? start + 24 * 60 * 60 * 1000 : start,
          end < 0 ? end + 24 * 60 * 60 * 1000 : end
        )
      });
      getStylesSafe({id: request.id}).then(([style]) => {
        if (style) {
          const enabled = start <= 0 && end > 0;
          console.error('Changing state', enabled, style.id);

          saveStyleSafe({
            id: request.id,
            enabled
          });
        }
        else {
          // clear schedule if style is not found
          console.error('removing since stlye is not found', request);
          schedule.execute(name, Object.assign(
            request, {enabled: false}
          ));
        }
      });
    }
    else {
      console.error('removing pref', name);
      schedule.prefs.remove(name);
    }
  });
};

// background only
if (BG === window) {
  schedule.prefs.subscribe((name, pref) => name.startsWith(SCHEDULE_PREFIX + '.') && schedule.execute(name, pref));

  chrome.alarms.onAlarm.addListener(({name}) => {
    schedule.prefs.get(name, prefs => {
      if (prefs[name]) {
        schedule.execute(name, prefs[name]);
      }
    });
  });

  (function (callback) {
    chrome.idle.onStateChanged.addListener(state => {
      if (state === 'active') {
        callback();
      }
    });
    window.setTimeout(callback);
  })(function () {
    schedule.prefs.getAll(prefs => prefs.forEach(a => schedule.execute(...a)));
  });
}
