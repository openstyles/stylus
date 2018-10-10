/* global messageBox msg setupLivePrefs enforceInputRange
  $ $$ $create $createLink
  FIREFOX OPERA CHROME URLS openURL prefs t API ignoreChromeError */
'use strict';

setupLivePrefs();
setupRadioButtons();
enforceInputRange($('#popupWidth'));
setTimeout(splitLongTooltips);

// collapse #advanced block in Chrome pre-66 (classic chrome://extensions UI)
if (!FIREFOX && !OPERA && CHROME < 3343) {
  const block = $('#advanced');
  $('h1', block).onclick = event => {
    event.preventDefault();
    block.classList.toggle('collapsed');
    const isCollapsed = block.classList.contains('collapsed');
    const visibleToggle = $(isCollapsed ? '.is-collapsed' : '.is-expanded', block);
    visibleToggle.focus();
  };
  block.classList.add('collapsible', 'collapsed');
}

if (FIREFOX && 'update' in (chrome.commands || {})) {
  $('[data-cmd="open-keyboard"]').classList.remove('chromium-only');
  msg.onExtension(msg => {
    if (msg.method === 'optionsCustomizeHotkeys') {
      customizeHotkeys();
    }
  });
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
      if (FIREFOX) {
        customizeHotkeys();
      } else {
        openURL({url: URLS.configureCommands});
      }
      e.preventDefault();
      break;

    case 'reset':
      $$('input')
        .filter(input => input.id in prefs.defaults)
        .forEach(input => prefs.reset(input.id));
      break;

    case 'note': {
      e.preventDefault();
      messageBox({
        className: 'note',
        contents: target.title,
        buttons: [t('confirmClose')],
      });
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

function customizeHotkeys() {
  // command name -> i18n id
  const hotkeys = new Map([
    ['_execute_browser_action', 'optionsCustomizePopup'],
    ['openManage', 'openManage'],
    ['styleDisableAll', 'disableAllStyles'],
  ]);

  messageBox({
    title: t('shortcutsNote'),
    contents: [
      $create('table',
        [...hotkeys.entries()].map(([cmd, i18n]) =>
          $create('tr', [
            $create('td', t(i18n)),
            $create('td',
              $create('input', {
                id: 'hotkey.' + cmd,
                type: 'search',
                //placeholder: t('helpKeyMapHotkey'),
              })),
          ]))),
    ],
    className: 'center',
    buttons: [t('confirmClose')],
    onshow(box) {
      const ids = [];
      for (const cmd of hotkeys.keys()) {
        const id = 'hotkey.' + cmd;
        ids.push(id);
        $('#' + id).oninput = onInput;
      }
      setupLivePrefs(ids);
      $('button', box).insertAdjacentElement('beforebegin',
        $createLink(
          'https://developer.mozilla.org/Add-ons/WebExtensions/manifest.json/commands#Key_combinations',
          t('helpAlt')));
    },
  });

  function onInput() {
    const name = this.id.split('.')[1];
    const shortcut = this.value.trim();
    if (!shortcut) {
      browser.commands.reset(name).catch(ignoreChromeError);
      this.setCustomValidity('');
      return;
    }
    try {
      browser.commands.update({name, shortcut}).then(
        () => this.setCustomValidity(''),
        err => this.setCustomValidity(err)
      );
    } catch (err) {
      this.setCustomValidity(err);
    }
  }
}
