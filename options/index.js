'use strict';

setupLivePrefs([
  'show-badge',
  'popup.stylesFirst',
  'badgeNormal',
  'badgeDisabled',
  'popupWidth',
  'updateInterval',
]);
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

  function check() {
    let total = 0;
    let checked = 0;
    let updated = 0;
    $('#update-progress').style.width = 0;
    $('#updates-installed').dataset.value = '';
    document.body.classList.add('update-in-progress');
    const maxWidth = $('#update-progress').parentElement.clientWidth;
    function showProgress() {
      $('#update-progress').style.width = Math.round(checked / total * maxWidth) + 'px';
      $('#updates-installed').dataset.value = updated || '';
    }
    function done() {
      document.body.classList.remove('update-in-progress');
    }
    BG.update.perform((cmd, value) => {
      switch (cmd) {
        case 'count':
          total = value;
          if (!total) {
            done();
          }
          break;
        case 'single-updated':
          updated++;
          // fallthrough
        case 'single-skipped':
          checked++;
          if (total && checked === total) {
            done();
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

  switch (target.dataset.cmd) {
    case 'open-manage':
      openURL({url: '/manage.html'});
      break;

    case 'check-updates':
      check();
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
