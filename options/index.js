/* globals configureCommands */
'use strict';


function restore () {
  chrome.runtime.getBackgroundPage(bg => {
    $('#badgeDisabled').value = bg.prefs.get('badgeDisabled');
    $('#badgeNormal').value = bg.prefs.get('badgeNormal');
    $('#popupWidth').value = localStorage.getItem('popupWidth') || '246';
    $('#updateInterval').value = bg.prefs.get('updateInterval');
    enforceValueRange('popupWidth');
  });
}


function save () {
  chrome.runtime.getBackgroundPage(bg => {
    bg.prefs.set('badgeDisabled', $('#badgeDisabled').value);
    bg.prefs.set('badgeNormal', $('#badgeNormal').value);
    localStorage.setItem('popupWidth', enforceValueRange('popupWidth'));
    bg.prefs.set(
      'updateInterval',
      Math.max(0, +$('#updateInterval').value)
    );
    // display notification
    let status = $('#status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 750);
  });
}


function enforceValueRange(id) {
  let element = document.getElementById(id);
  let value = Number(element.value);
  const min = Number(element.min);
  const max = Number(element.max);
  if (value < min || value > max) {
    value = Math.max(min, Math.min(max, value));
    element.value = value;
  }
  element.onchange = element.onchange || (() => enforceValueRange(id));
  return value;
}


onDOMready().then(restore);
$('#save').onclick = save;

// overwrite the default URL if browser is Opera
$('[data-cmd="open-keyboard"]').textContent =
  configureCommands.url;

// actions
document.onclick = e => {
  let cmd = e.target.dataset.cmd;
  let total = 0, updated = 0;

  function update () {
    $('#update-counter').textContent = `${updated}/${total}`;
  }
  function done (target) {
    target.disabled = false;
    window.setTimeout(() => {
      $('#update-counter').textContent = '';
    }, 750);
  }

  switch (cmd) {

  case 'open-manage':
    openURL({url: '/manage.html'});
    break;

  case'check-updates':
    e.target.disabled = true;
    chrome.runtime.getBackgroundPage(bg => {
      bg.update.perform((cmd, value) => {
        if (cmd === 'count') {
          total = value;
          if (!total) {
            done(e.target);
          }
        }
        else if (cmd === 'single-updated' || cmd === 'single-skipped') {
          updated += 1;
          if (total && updated === total) {
            done(e.target);
          }
        }
        update();
      });
    });
    // notify the automatic updater to reset the next automatic update accordingly
    chrome.runtime.sendMessage({
      method: 'resetInterval'
    });
    break;

  case 'open-keyboard':
    configureCommands.open();
    break;

  }
};
