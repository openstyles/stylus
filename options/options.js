'use strict';

setupLivePrefs();
setupRadioButtons();
enforceInputRange($('#popupWidth'));
setTimeout(splitLongTooltips);

if (!FIREFOX && !OPERA) {
  const block = $('#advanced');
  const toggleAdvanced = event => {
    if (block.classList.contains('collapsed') || event.target.closest('h1')) {
      block.classList.toggle('collapsed');
    }
  };
  block.classList.add('collapsible', 'collapsed');
  block.onclick = toggleAdvanced;
  block.onkeydown = event => event.which === 13 && toggleAdvanced(event);
  $('h1', block).tabIndex = 0;
}

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

    case 'note': {
      const tooltip = (target.closest('[title]') || {}).title;
      if (tooltip && 'ontouchstart' in document) {
        e.preventDefault();
        target.parentNode.replaceChild($create('.expanded-note', tooltip), target);
      }
    }
  }
};

function checkUpdates() {
  let total = 0;
  let checked = 0;
  let updated = 0;
  const maxWidth = $('#update-progress').parentElement.clientWidth;

  chrome.runtime.onConnect.addListener(function onConnect(port) {
    if (port.name !== 'updater') return;
    port.onMessage.addListener(observer);
    chrome.runtime.onConnect.removeListener(onConnect);
  });

  API.updateCheckAll({observe: true});

  function observer(info) {
    if ('count' in info) {
      total = info.count;
      document.body.classList.add('update-in-progress');
    } else if (info.updated) {
      updated++;
      checked++;
    } else if (info.error) {
      checked++;
    } else if (info.done) {
      document.body.classList.remove('update-in-progress');
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

function splitLongTooltips() {
  for (const el of $$('[title]')) {
    if (el.title.length < 50) {
      continue;
    }
    const newTitle = el.title
      .split('\n')
      .map(s => s.replace(/([^.][.。?!]|.{50,60},)\s+/g, '$1\n'))
      .map(s => s.replace(/(.{50,80}(?=.{40,}))\s+/g, '$1\n'))
      .join('\n');
    if (newTitle !== el.title) {
      el.title = newTitle;
    }
  }
}
