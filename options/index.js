'use strict';

setupLivePrefs();
enforceInputRange($('#popupWidth'));

// overwrite the default URL if browser is Opera
$('[data-cmd="open-keyboard"]').href = URLS.configureCommands;

// actions
document.onclick = e => {
  const target = e.target.closest('[data-cmd]');
  if (!target) {
    return;
  }
  // prevent double-triggering in case a sub-element was clicked
  e.stopPropagation();

  switch (target.dataset.cmd) {
    case 'open-manage':
      openURL({url: '/manage.html'});
      break;

    case 'check-updates':
      checkUpdates();
      break;

    case 'open-keyboard':
      openURL({url: e.target.href});
      e.preventDefault();
      break;

    case 'reset':
      $$('input')
        .filter(input => input.id in prefs.readOnlyValues)
        .forEach(input => prefs.reset(input.id));
      break;
  }
};

function checkUpdates() {
  let total = 0;
  let checked = 0;
  let updated = 0;
  const maxWidth = $('#update-progress').parentElement.clientWidth;
  BG.updater.checkAllStyles({observer});

  function observer(state, value) {
    switch (state) {
      case BG.updater.COUNT:
        total = value;
        document.body.classList.add('update-in-progress');
        break;
      case BG.updater.UPDATED:
        updated++;
        // fallthrough
      case BG.updater.SKIPPED:
        checked++;
        break;
      case BG.updater.DONE:
        document.body.classList.remove('update-in-progress');
        return;
    }
    $('#update-progress').style.width = Math.round(checked / total * maxWidth) + 'px';
    $('#updates-installed').dataset.value = updated || '';
  }
}
