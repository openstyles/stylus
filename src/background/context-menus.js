import '@/js/browser';
import {kDisableAll} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {CHROME} from '@/js/ua';
import {ownRoot} from '@/js/urls';
import {t} from '@/js/util';
import {ignoreChromeError} from '@/js/util-webext';
import {sendTab} from './broadcast';
import {openManager} from './tab-util';

const kStyleManager = 'styleManager';
/** Keeping r-less old spelling to preserve user's browser pref for the hotkey */
const kOpenManage = 'openManage';
const kOpenOptions = 'openOptions';
const kReload = 'reload';
const kStyleDisableAll = 'styleDisableAll';

const cmdOpenManager = () => openManager();
const cmdOpenOptions = () => openManager({options: true});
const cmdReload = () => chrome.runtime.reload();
const cmdStyleDisableAll = info => prefs.ready.then(() => prefs.set(kDisableAll,
  info ? info.checked : !prefs.__values[kDisableAll]));

const COMMANDS = {
  [kOpenManage]: cmdOpenManager,
  [kOpenOptions]: cmdOpenOptions,
  [kReload]: cmdReload,
  [kStyleDisableAll]: cmdStyleDisableAll,
};

const chromeMenus = chrome.contextMenus;

/** id is either a prefs id or an i18n key to be used for the title */
const MENUS = !chromeMenus ? {} : Object.assign({
  'show-badge': [togglePref, {title: 'menuShowBadge'}],
  [kDisableAll]: [cmdStyleDisableAll, {title: 'disableAllStyles'}],
  [kStyleManager]: [cmdOpenManager],
  [kOpenOptions]: [cmdOpenOptions],
  [kReload]: [cmdReload],
}, CHROME && {
  'editor.contextDelete': [(info, tab) => {
    sendTab(tab.id, {method: 'editDeleteText'});
  }, {
    title: 'editDeleteText',
    type: 'normal',
    contexts: ['editable'],
    documentUrlPatterns: [ownRoot + '*'],
  }],
});

chrome.commands?.onCommand.addListener(id => COMMANDS[id]());
chromeMenus?.onClicked.addListener((info, tab) => MENUS[info.menuItemId][0](info, tab));

export default function initContextMenus() {
  createContextMenus(Object.keys(MENUS), true);

  function createContextMenus(ids, isInit) {
    for (const id of ids) {
      const item = MENUS[id][1] ??= {};
      if (isInit) {
        item.id = id;
        item.contexts ??= [__.MV3 ? 'action' : 'browser_action'];
        item.title = t(item.title ?? id);
      }
      if (typeof prefs.__defaults[id] === 'boolean') {
        if (!item.type) {
          item.type = 'checkbox';
          item.checked = prefs.__values[id];
          if (isInit) {
            prefs.subscribe(id,
              !__.MV3 && __.BUILD !== 'firefox' && CHROME >= 62 && CHROME <= 64
              ? toggleCheckmarkBugged
              : toggleCheckmark);
          }
        } else if (isInit) {
          prefs.subscribe(id, togglePresence, true);
          continue;
        }
      }
      chromeMenus.create(item, ignoreChromeError);
    }
  }

  function toggleCheckmark(id, checked) {
    chromeMenus.update(id, {checked}, ignoreChromeError);
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
      chromeMenus.remove(id, ignoreChromeError);
    }
  }

}

/** @param {chrome.contextMenus.OnClickData} info */
function togglePref(info) {
  prefs.set(info.menuItemId, info.checked);
}
