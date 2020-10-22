/* global messageBox msg setupLivePrefs enforceInputRange
  $ $$ $create $createLink
  FIREFOX OPERA CHROME URLS openURL prefs t API ignoreChromeError
  CHROME_HAS_BORDER_BUG capitalize */
'use strict';

setupLivePrefs();
$$('input[min], input[max]').forEach(enforceInputRange);
setTimeout(splitLongTooltips);

if (CHROME_HAS_BORDER_BUG) {
  const borderOption = $('.chrome-no-popup-border');
  if (borderOption) {
    borderOption.classList.remove('chrome-no-popup-border');
  }
}

// collapse #advanced block in Chrome pre-66 (classic chrome://extensions UI)
if (!FIREFOX && !OPERA && CHROME < 66) {
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

if (CHROME) {
  // Show the option as disabled until the permission is actually granted
  const el = $('#styleViaXhr');
  el.addEventListener('click', () => {
    if (el.checked && !chrome.declarativeContent) {
      chrome.permissions.request({permissions: ['declarativeContent']}, ok => {
        if (chrome.runtime.lastError || !ok) {
          el.checked = false;
        }
      });
    }
  });
  if (!chrome.declarativeContent) {
    prefs.initializing.then(() => {
      if (prefs.get('styleViaXhr')) {
        el.checked = false;
      }
    });
  }
}

// actions
$('#options-close-icon').onclick = () => {
  top.dispatchEvent(new CustomEvent('closeOptions'));
};

document.onclick = e => {
  const target = e.target.closest('[data-cmd]');
  if (!target) {
    return;
  }
  // prevent double-triggering in case a sub-element was clicked
  e.stopPropagation();

  switch (target.dataset.cmd) {
    case 'open-manage':
      API.openManage();
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
        contents: target.dataset.title,
        buttons: [t('confirmClose')],
      });
    }
  }
};

// sync to cloud
(() => {
  const cloud = document.querySelector('.sync-options .cloud-name');
  const connectButton = document.querySelector('.sync-options .connect');
  const disconnectButton = document.querySelector('.sync-options .disconnect');
  const syncButton = document.querySelector('.sync-options .sync-now');
  const statusText = document.querySelector('.sync-options .sync-status');
  const loginButton = document.querySelector('.sync-options .sync-login');

  let status = {};

  msg.onExtension(e => {
    if (e.method === 'syncStatusUpdate') {
      status = e.status;
      updateButtons();
    }
  });

  API.getSyncStatus()
    .then(_status => {
      status = _status;
      updateButtons();
    });

  function validClick(e) {
    return e.button === 0 && !e.ctrl && !e.alt && !e.shift;
  }

  cloud.addEventListener('change', updateButtons);

  function updateButtons() {
    if (status.currentDriveName) {
      cloud.value = status.currentDriveName;
    }
    cloud.disabled = status.state !== 'disconnected';
    connectButton.disabled = status.state !== 'disconnected' || cloud.value === 'none';
    disconnectButton.disabled = status.state !== 'connected' || status.syncing;
    syncButton.disabled = status.state !== 'connected' || status.syncing;
    statusText.textContent = getStatusText();
    loginButton.style.display = status.state === 'connected' && !status.login ? '' : 'none';
  }

  function getStatusText() {
    if (status.syncing) {
      if (status.progress) {
        const {phase, loaded, total} = status.progress;
        return chrome.i18n.getMessage(`optionsSyncStatus${capitalize(phase)}`, [loaded + 1, total]) ||
          `${phase} ${loaded} / ${total}`;
      }
      return chrome.i18n.getMessage('optionsSyncStatusSyncing') || 'syncing';
    }
    if ((status.state === 'connected' || status.state === 'disconnected') && status.errorMessage) {
      return status.errorMessage;
    }
    return chrome.i18n.getMessage(`optionsSyncStatus${capitalize(status.state)}`) || status.state;
  }

  connectButton.addEventListener('click', e => {
    if (validClick(e)) {
      API.syncStart(cloud.value).catch(console.error);
    }
  });

  disconnectButton.addEventListener('click', e => {
    if (validClick(e)) {
      API.syncStop().catch(console.error);
    }
  });

  syncButton.addEventListener('click', e => {
    if (validClick(e)) {
      API.syncNow().catch(console.error);
    }
  });

  loginButton.addEventListener('click', e => {
    if (validClick(e)) {
      API.syncLogin().catch(console.error);
    }
  });
})();

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
      el.dataset.title = el.title;
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

window.onkeydown = event => {
  if (event.key === 'Escape') {
    top.dispatchEvent(new CustomEvent('closeOptions'));
  }
};
