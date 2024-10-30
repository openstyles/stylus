import '/js/browser';
import {sendTab} from '/js/msg';
import * as prefs from '/js/prefs';
import {CHROME} from '/js/ua';
import {ownRoot} from '/js/urls';
import {ignoreChromeError} from '/js/util-webext';
import {browserCommands} from './common';

let ITEMS;

chrome.contextMenus.onClicked.addListener((info, tab) =>
  ITEMS[info.menuItemId][0](info, tab));

export default function initContextMenus() {
  /** id is either a prefs id or an i18n key to be used for the title */
  ITEMS = Object.assign({
    'show-badge': [togglePref, {title: 'menuShowBadge'}],
    'disableAll': [browserCommands.styleDisableAll, {title: 'disableAllStyles'}],
    'styleManager': [browserCommands.openManage],
    'openOptions': [browserCommands.openOptions],
    'reload': [browserCommands.reload],
  }, CHROME && {
    'editor.contextDelete': [(info, tab) => {
      sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension');
    }, {
      title: 'editDeleteText',
      type: 'normal',
      contexts: ['editable'],
      documentUrlPatterns: [ownRoot + '*'],
    }],
  });
  createContextMenus(Object.keys(ITEMS), true);

  function createContextMenus(ids, isInit) {
    for (const id of ids) {
      const item = ITEMS[id][1] ??= {};
      if (isInit) {
        item.id = id;
        item.contexts ??= [process.env.MV3 ? 'action' : 'browser_action'];
        item.title = chrome.i18n.getMessage(item.title ?? id);
      }
      if (typeof prefs.__defaults[id] === 'boolean') {
        if (!item.type) {
          item.type = 'checkbox';
          item.checked = prefs.__values[id];
          if (isInit) {
            prefs.subscribe(id,
              !process.env.MV3 && process.env.BUILD !== 'firefox' && CHROME >= 62 && CHROME <= 64
              ? toggleCheckmarkBugged
              : toggleCheckmark);
          }
        } else if (isInit) {
          prefs.subscribe(id, togglePresence, true);
          continue;
        }
      }
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
