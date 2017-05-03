/* global t, schedule, $, $$ */
'use strict';

schedule.ui = {};

/* get start and end inputs */
schedule.ui.inputs = (parent) => $$('input[type=time]', parent);

/* updating schedule section of a single style */
schedule.ui.update = (request) => {
  const parent = $(`[id="style-${request.id}"] .schedule`);
  if (parent) {
    parent.dataset.active = true;
    $('input[type=button]', parent).value = t('scheduleButtonActive');
    const [start, end] = schedule.ui.inputs(parent);
    start.value = request.start;
    end.value = request.end;
  }
};

/* display schedule panel and hide it when user selects outside area */
document.addEventListener('click', e => {
  const target = e.target;
  let parent;
  // hide schedule panel
  function observe (e) {
    if (!parent.contains(e.target)) {
      const [start, end] = schedule.ui.inputs(parent);
      const id = target.closest('.entry').id.replace('style-', '');
      switch ([start.value, end.value].filter(v => v).length) {
        case 0:
          chrome.runtime.sendMessage({
            method: 'schedule',
            enabled: false,
            id
          });
          break;
        case 1: // when only start or end value is set; display an alert
          window.alert(t('scheduleMSG'));
          [start, end].filter(o => !o.value).forEach(o => o.focus());
          return;
        default:
          chrome.runtime.sendMessage({
            method: 'schedule',
            enabled: true,
            id,
            start: start.value,
            end: end.value
          });
      }

      document.removeEventListener('click', observe);
      parent.dataset.edit = false;
    }
  }
  // display schedule panel
  if (target.dataset.cmd === 'schedule') {
    parent = target.closest('div');
    parent.dataset.edit = true;
    document.addEventListener('click', observe);
  }
});
/* update schedule section on styles ready */
document.addEventListener('styles-ready', () => {
  console.log('"styles-ready" is called');
  schedule.prefs.getAll(prefs => {
    prefs.forEach(([name, pref]) => schedule.ui.update(pref));
  });
});
/* update schedule section on style change */
document.addEventListener('style-edited', e => {
  console.log('"style-edited" is called');
  const id = e.detail.id;
  const name = schedule.prefs.name(id);
  schedule.prefs.get(name, prefs => {
    const pref = prefs[name];
    if (pref) {
      schedule.ui.update(pref);
    }
  });
});
