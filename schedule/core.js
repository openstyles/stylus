/* globals getStylesSafe, saveStyleSafe, BG */
'use strict';

var SCHEDULE_PREFIX = 'schedule';

var schedule = {};

schedule.prefs = {
  name (id) {
    return SCHEDULE_PREFIX + '.' + id;
  },
  validate (name) {
    return name.startsWith(SCHEDULE_PREFIX + '.');
  },
  get (name, callback) {
    chrome.storage.local.get(name, callback);
  },
  getAll (callback) {
    schedule.prefs.get(null, prefs => {
      callback(
        Object.keys(prefs).filter(schedule.prefs.validate)
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
/* call this function when schedule timing is modified; if timing is not modified, nothing happens */
schedule.entry = request => {
  console.log('schedule.entry', 'schedule timing might have been changed', request);
  return new Promise((resolve, reject) => {
    chrome.permissions.request({
      permissions: ['idle', 'alarms']
    }, (granted) => {
      if (granted) {
        schedule.prefs.set(schedule.prefs.name(request.id), {
          id: request.id,
          start: request.start,
          end: request.end,
          enabled: request.enabled
        }, resolve);
      }
      else {
        reject(new Error('Required permissions are not granted'));
      }
    });
  });
};
/* call this to update current alarm. If request.enabled = false, then alarm is cleared and this job will be removed from the storage */
schedule.execute = (name, request) => {
  console.log('schedule.execute', 'evaluating response', name, request);
  chrome.alarms.clear(name, () => {
    if (request.enabled) {
      const now = new Date();
      let start = new Date(now.toDateString() + ' ' + request.start).getTime() - now;
      let end = new Date(now.toDateString() + ' ' + request.end).getTime() - now;
      const when = now.getTime() + Math.min(
        start < 0 ? start + 24 * 60 * 60 * 1000 : start,
        end < 0 ? end + 24 * 60 * 60 * 1000 : end
      );
      console.log(`next alarm is set for id = ${request.id}`, new Date(when), start, end);
      chrome.alarms.create(name, {when});
      getStylesSafe({id: request.id}).then(([style]) => {
        if (style) {
          const enabled = (start <= 0 && end > 0) || (start > end && start * end > 0) ;
          console.log(`style with id = ${style.id}; enabled = `, enabled);

          saveStyleSafe({
            id: request.id,
            enabled
          });
        }
        else {
          // clear schedule if style is not found
          console.log('removing from storage since style is not found', request);
          schedule.execute(name, Object.assign(
            request, {enabled: false}
          ));
        }
      });
    }
    else {
      console.log('removing pref since request.enabled is false', name);
      schedule.prefs.remove(name);
    }
  });
};

// background only
if (BG === window) {
  // listen for pref changes to update chrome.alarms
  schedule.prefs.subscribe((name, pref) => schedule.prefs.validate(name) && schedule.execute(name, pref));

  chrome.alarms.onAlarm.addListener(({name}) => {
    schedule.prefs.get(name, prefs => prefs[name] && schedule.execute(name, prefs[name]));
  });

  (function (callback) {
    chrome.idle.onStateChanged.addListener(state => state === 'active' && callback());
    window.setTimeout(callback);
  })(function () {
    console.log('updating all schedules');
    schedule.prefs.getAll(prefs => prefs.forEach(a => schedule.execute(...a)));
  });
}
