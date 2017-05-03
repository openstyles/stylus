/* global t, schedule */
'use strict';

document.addEventListener('click', e => {
  const target = e.target;
  let parent;
  // hide schedule panel
  function observe (e) {
    if (!parent.contains(e.target)) {
      const [start, end] = parent.querySelectorAll('input[type=time]');
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

function test () {
  schedule.prefs.getAll(prefs => {
    prefs.forEach(([name, pref]) => {
      const parent = document.querySelector(`[id="style-${pref.id}"] .schedule`);
      if (parent) {
        parent.dataset.active = true;
        parent.querySelector('input[type=button]').value = t('scheduleButtonActive');
        const [start, end] = parent.querySelectorAll('input[type=time');
        start.value = pref.start;
        end.value = pref.end;
      }
    });
  });
}

window.setTimeout(test, 1000);
