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
  const cmd = e.target.dataset.cmd;
  let total = 0;
  let updated = 0;

  function check() {
    const originalLabel = e.target.textContent;
    e.target.disabled = true;
    e.target.parentElement.setAttribute('disabled', '');
    function showProgress() {
      e.target.textContent = `${updated} / ${total}`;
    }
    function done() {
      setTimeout(() => {
        e.target.disabled = false;
        e.target.textContent = originalLabel;
        e.target.parentElement.removeAttribute('disabled');
      }, 750);
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
        case 'single-skipped':
          updated++;
          if (total && updated === total) {
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

  switch (cmd) {
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
