/* global browserCommands */// background.js
/* global msg */
/* global prefs */
/* global CHROME URLS ignoreChromeError */// toolbox.js
'use strict';

chrome.management.getSelf(ext => {
  const contextMenus = Object.assign({
    'show-badge': {
      title: 'menuShowBadge',
      click: togglePref,
    },
    'disableAll': {
      title: 'disableAllStyles',
      click: browserCommands.styleDisableAll,
    },
    'open-manager': {
      title: 'optionsOpenManager',
      click: browserCommands.openManage,
    },
    'open-options': {
      title: 'openOptions',
      click: browserCommands.openOptions,
    },
  }, ext.installType === 'development' && {
    'reload': {
      title: 'reload',
      click: browserCommands.reload,
    },
  }, CHROME && {
    'editor.contextDelete': {
      title: 'editDeleteText',
      type: 'normal',
      contexts: ['editable'],
      documentUrlPatterns: [URLS.ownOrigin + '*'],
      click: (info, tab) => {
        msg.sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension')
          .catch(msg.ignoreError);
      },
    },
  });

  createContextMenus(Object.keys(contextMenus));
  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));

  function createContextMenus(ids) {
    for (const id of ids) {
      const item = Object.assign({id, contexts: ['browser_action']}, contextMenus[id]);
      item.title = chrome.i18n.getMessage(item.title);
      if (typeof prefs.defaults[id] === 'boolean') {
        if (item.type) {
          prefs.subscribe(id, togglePresence);
        } else {
          item.type = 'checkbox';
          item.checked = prefs.get(id);
          prefs.subscribe(id, CHROME >= 62 && CHROME <= 64 ? toggleCheckmarkBugged : toggleCheckmark);
        }
      }
      delete item.click;
      chrome.contextMenus.create(item, ignoreChromeError);
    }
  }

  function toggleCheckmark(id, checked) {
    chrome.contextMenus.update(id, {checked}, ignoreChromeError);
  }

  /** Circumvents the bug with disabling check marks in Chrome 62-64 */
  async function toggleCheckmarkBugged(id) {
    await browser.contextMenus.remove(id).catch(ignoreChromeError);
    createContextMenus([id]);
  }

  /** @param {chrome.contextMenus.OnClickData} info */
  function togglePref(info) {
    prefs.set(info.menuItemId, info.checked);
  }

  function togglePresence(id, checked) {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  }
});
