/* global update */
'use strict';


function restore() {
  setupLivePrefs([
    'show-badge',
    'popup.stylesFirst'
  ]);
  //$('#show-badge').value = bg.prefs.get('show-badge');
  $('#badgeDisabled').value = prefs.get('badgeDisabled');
  $('#badgeNormal').value = prefs.get('badgeNormal');
  $('#popupWidth').value = localStorage.getItem('popupWidth') || '246';
  $('#updateInterval').value = prefs.get('updateInterval');
  enforceValueRange('popupWidth');
}


function save() {
  prefs.set('badgeDisabled', $('#badgeDisabled').value);
  prefs.set('badgeNormal', $('#badgeNormal').value);
  localStorage.setItem('popupWidth', enforceValueRange('popupWidth'));
  prefs.set(
    'updateInterval',
    Math.max(0, Number($('#updateInterval').value))
  );
  animateElement($('#save-status'), {className: 'fadeinout'});
}


function enforceValueRange(id) {
  const element = document.getElementById(id);
  const min = Number(element.min);
  const max = Number(element.max);
  let value = Number(element.value);
  if (value < min || value > max) {
    value = Math.max(min, Math.min(max, value));
    element.value = value;
  }
  element.onchange = element.onchange || (() => enforceValueRange(id));
  return value;
}


restore();
$('#save').onclick = save;

// overwrite the default URL if browser is Opera
$('[data-cmd="open-keyboard"]').href = configureCommands.url;

// actions
document.onclick = e => {
  const cmd = e.target.dataset.cmd;
  let total = 0;
  let updated = 0;

  function showProgress() {
    $('#update-counter').textContent = `${updated} / ${total}`;
  }

  function done(target) {
    target.disabled = false;
    window.setTimeout(() => {
      $('#update-counter').textContent = '';
    }, 750);
  }

  function check() {
    chrome.extension.getBackgroundPage().update.perform((cmd, value) => {
      switch (cmd) {
        case 'count':
          total = value;
          if (!total) {
            done(e.target);
          }
          break;
        case 'single-updated':
        case 'single-skipped':
          updated++;
          if (total && updated === total) {
            done(e.target);
          }
          break;
      }
      showProgress();
    });
    // notify the automatic updater to reset the next automatic update accordingly
    chrome.runtime.sendMessage({
      method: 'resetInterval'
    });
  }

  switch (cmd) {
    case 'open-manage':
      openURL({url: '/manage.html'});
      break;

    case 'check-updates':
      e.target.disabled = true;
      check();
      break;

    case 'open-keyboard':
      configureCommands.open();
      break;

  }
};
