/* global t, schedule, $, $$, messageBox */
'use strict';

schedule.ui = {};

/* get start and end inputs */
schedule.ui.inputs = (parent) => $$('input[type=time]', parent);

/* updating schedule section of a single style */
schedule.ui.update = (request) => {
  console.log('updating schedule ui', request);
  const parent = $(`[id="style-${request.id}"] .schedule`);
  if (parent) {
    parent.dataset.active = request.enabled;
    $('input[type=button]', parent).value = t(request.enabled ? 'scheduleButtonActive' : 'scheduleButton');
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
      let len = [start.value, end.value].filter(v => v).length;
      len = len === 2 && start.value === end.value ? 3 : len;
      switch (len) {
        case 0: // reset schedule for this id
          chrome.runtime.sendMessage({
            method: 'schedule',
            enabled: false,
            id
          }, () => {
            schedule.ui.update({ // reset UI
              enabled: false,
              id,
              start: '',
              end: ''
            });
          });
          break;
        case 3: // when both start and end have equal values
        case 1: // when only start or end value is set
          return messageBox({
            title: t('scheduleTitle'),
            contents: t(len === 1 ? 'scheduleOneEntry' : 'scheduleEqualEntries'),
            buttons: [t('scheduleButtonGiveUp'), t('scheduleButtonRetry')],
            onshow: e => e.addEventListener('click', e => e.stopPropagation())
          }).then((r) => {
            if (r.button === 1 && len === 1) { // retry
              [start, end].filter(o => !o.value).forEach(o => o.focus());
            }
            else if (r.button === 1 && len === 3) {
              start.focus();
            }
            else {
              // clear and hide UI
              start.value = end.value = '';
              document.body.click();
            }
          });
        default:
          chrome.runtime.sendMessage({
            method: 'schedule',
            enabled: true,
            id,
            start: start.value,
            end: end.value
          }, () => {});
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
