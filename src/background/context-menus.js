import '/js/browser';
import {sendTab} from '/js/msg';
import * as prefs from '/js/prefs';
import {ignoreChromeError} from '/js/util-webext';
import {CHROME} from '/js/ua';
import {ownRoot} from '/js/urls';
import {browserCommands} from './common';

export default async function initContextMenus() {
  const ext = await browser.management.getSelf();
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
      documentUrlPatterns: [ownRoot + '*'],
      click: (info, tab) => {
        sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension');
      },
    },
  });

  createContextMenus(Object.keys(contextMenus), true);
  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));

  function createContextMenus(ids, isInit) {
    for (const id of ids) {
      const item = Object.assign({id, contexts: ['browser_action']}, contextMenus[id]);
      item.title = chrome.i18n.getMessage(item.title);
      if (typeof prefs.defaults[id] === 'boolean') {
        if (!item.type) {
          item.type = 'checkbox';
          item.checked = prefs.get(id);
          if (isInit) {
            prefs.subscribe(id, CHROME >= 62 && CHROME <= 64
              ? toggleCheckmarkBugged
              : toggleCheckmark);
          }
        } else if (isInit) {
          prefs.subscribe(id, togglePresence, true);
          continue;
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
}
