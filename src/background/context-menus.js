import '/js/browser';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {CHROME} from '/js/ua';
import {ownRoot} from '/js/urls';
import {ignoreChromeError} from '/js/util-webext';
import {sendTab} from './broadcast';

const kDisableAll = 'disableAll';
const kStyleManager = 'styleManager';
const kOpenOptions = 'openOptions';
const kReload = 'reload';

const openManage = () => API.openManage();
const openOptions = () => API.openManage({options: true});
const reload = chrome.runtime.reload;
const styleDisableAll = info => prefs.set(kDisableAll,
  info ? info.checked : !prefs.get(kDisableAll));

const COMMANDS = {
  openManage,
  [kOpenOptions]: openOptions,
  [kReload]: reload,
  styleDisableAll,
};

/** id is either a prefs id or an i18n key to be used for the title */
const MENUS = Object.assign({
  'show-badge': [togglePref, {title: 'menuShowBadge'}],
  [kDisableAll]: [styleDisableAll, {title: 'disableAllStyles'}],
  [kStyleManager]: [openManage],
  [kOpenOptions]: [openOptions],
  [kReload]: [reload],
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

chrome.commands?.onCommand.addListener(id => COMMANDS[id]());
chrome.contextMenus.onClicked.addListener((info, tab) => MENUS[info.menuItemId][0](info, tab));

export default function initContextMenus() {
  createContextMenus(Object.keys(MENUS), true);

  function createContextMenus(ids, isInit) {
    for (const id of ids) {
      const item = MENUS[id][1] ??= {};
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

  function togglePresence(id, checked) {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  }

}

/** @param {chrome.contextMenus.OnClickData} info */
function togglePref(info) {
  prefs.set(info.menuItemId, info.checked);
}
