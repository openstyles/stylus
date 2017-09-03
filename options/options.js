'use strict';

setupLivePrefs();
setupRadioButtons();
enforceInputRange($('#popupWidth'));

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
      openURL({url: 'manage.html'});
      break;

    case 'check-updates':
      checkUpdates();
      break;

    case 'open-keyboard':
      openURL({url: URLS.configureCommands});
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

function setupRadioButtons() {
  const sets = {};
  const onChange = function () {
    const newValue = sets[this.name].indexOf(this);
    if (newValue >= 0 && prefs.get(this.name) !== newValue) {
      prefs.set(this.name, newValue);
    }
  };
  // group all radio-inputs by name="prefName" attribute
  for (const el of $$('input[type="radio"][name]')) {
    (sets[el.name] = sets[el.name] || []).push(el);
    el.addEventListener('change', onChange);
  }
  // select the input corresponding to the actual pref value
  for (const name in sets) {
    sets[name][prefs.get(name)].checked = true;
  }
  // listen to pref changes and update the values
  prefs.subscribe(Object.keys(sets), (key, value) => {
    sets[key][value].checked = true;
  });
}
