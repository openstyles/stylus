/* global browserCommands */// background.js
/* global msg */
/* global prefs */
/* global CHROME URLS ignoreChromeError */// toolbox.js
'use strict';

(() => {
  const contextMenus = {
    'show-badge': {
      title: 'menuShowBadge',
      click: info => prefs.set(info.menuItemId, info.checked),
    },
    'disableAll': {
      title: 'disableAllStyles',
      click: browserCommands.styleDisableAll,
    },
    'open-manager': {
      title: 'openStylesManager',
      click: browserCommands.openManage,
    },
    'open-options': {
      title: 'openOptions',
      click: browserCommands.openOptions,
    },
    'reload': {
      presentIf: async () => (await browser.management.getSelf()).installType === 'development',
      title: 'reload',
      click: browserCommands.reload,
    },
    'editor.contextDelete': {
      presentIf: () => CHROME && prefs.get('editor.contextDelete'),
      title: 'editDeleteText',
      type: 'normal',
      contexts: ['editable'],
      documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
      click: (info, tab) => {
        msg.sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension')
          .catch(msg.ignoreError);
      },
    },
  };

  prefs.__defaults['editor.contextDelete'] = Boolean(CHROME);

  const keys = Object.keys(contextMenus);
  prefs.subscribe(keys.filter(id => typeof prefs.defaults[id] === 'boolean'),
    CHROME >= 62 && CHROME <= 64 ? toggleCheckmarkBugged : toggleCheckmark);
  prefs.subscribe(keys.filter(id => contextMenus[id].presentIf && prefs.knownKeys.includes(id)),
    togglePresence);

  createContextMenus(keys);

  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));

  async function createContextMenus(ids) {
    for (const id of ids) {
      let item = contextMenus[id];
      if (item.presentIf && !await item.presentIf()) {
        continue;
      }
      item = Object.assign({id}, item);
      delete item.presentIf;
      item.title = chrome.i18n.getMessage(item.title);
      if (!item.type && typeof prefs.defaults[id] === 'boolean') {
        item.type = 'checkbox';
        item.checked = prefs.get(id);
      }
      if (!item.contexts) {
        item.contexts = ['browser_action'];
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

  function togglePresence(id, checked) {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  }
})();
