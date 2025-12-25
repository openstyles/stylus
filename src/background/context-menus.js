import '@/js/browser';
import {kDisableAll, kStyleIds, kTabOvr, kTabOvrToggle} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {CHROME} from '@/js/ua';
import {ownRoot} from '@/js/urls';
import {NOP, t} from '@/js/util';
import {getActiveTab, ignoreChromeError, MF} from '@/js/util-webext';
import {sendTab} from './broadcast';
import * as styleMan from './style-manager';
import {tabCache} from './tab-manager';
import {openManager} from './tab-util';

const kStyleManager = 'styleManager';
/** Keeping r-less old spelling to preserve user's browser pref for the hotkey */
const kOpenManage = 'openManage';
const kOpenOptions = 'openOptions';
const kReload = 'reload';
const kStyleDisableAll = 'styleDisableAll';
const kToggleTab = 'toggleTab';

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
  [kToggleTab]: cmdToggleTab,
};

const chromeCommands = chrome.commands;
const chromeMenus = chrome.contextMenus;

/** id is either a prefs id or an i18n key to be used for the title */
const MENUS = !!chromeMenus && {
  'show-badge': [togglePref, {title: t('menuShowBadge')}],
};
if (MENUS) {
  for (const [menuId, cmdId = menuId] of [
    [kToggleTab],
    [kDisableAll, kStyleDisableAll],
    [kStyleManager, kOpenManage],
    [kOpenOptions],
    [kReload],
  ]) {
    MENUS[menuId] = [
      COMMANDS[cmdId],
      {title: MF.commands[cmdId]?.description || t(cmdId)},
    ];
  }
}
if (MENUS && (__.BUILD !== 'firefox' && CHROME)) {
  MENUS['editor.contextDelete'] = [(info, tab) => {
    sendTab(tab.id, {method: 'editDeleteText'});
  }, {
    title: t('editDeleteText'),
    type: 'normal',
    contexts: ['editable'],
    documentUrlPatterns: [ownRoot + '*'],
  }];
}

chromeCommands?.onCommand.addListener(id => COMMANDS[id]());
chromeMenus?.onClicked.addListener((info, tab) => MENUS[info.menuItemId][0](info, tab));

export default !chromeMenus ? NOP : function initContextMenus() {
  createContextMenus(Object.keys(MENUS), true);

  function createContextMenus(ids, isInit) {
    for (const id of ids) {
      const item = MENUS[id][1];
      if (isInit) {
        item.id = id;
        item.contexts ??= [__.MV3 ? 'action' : 'browser_action'];
        item.title = item.title ?? t(id);
      }
      if (typeof prefs.__defaults[id] === 'boolean') {
        if (!item.type) {
          item.type = 'checkbox';
          item.checked = prefs.__values[id];
          if (isInit) {
            prefs.subscribe(id, toggleCheckmark);
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

  function togglePresence(id, checked) {
    if (checked) {
      createContextMenus([id]);
    } else {
      chromeMenus.remove(id, ignoreChromeError);
    }
  }
};

/** @param {chrome.contextMenus.OnClickData} info */
function togglePref(info) {
  prefs.set(info.menuItemId, info.checked);
}

async function cmdToggleTab(info, tab) {
  const td = (tab ??= await getActiveTab()) && tabCache[tab.id];
  if (!td)
    return;
  /** 0: all off, 1: all on (not used here, only in popup), 2: initial state */
  let [state, skip, ovrs] = td[kTabOvrToggle] || [];
  let ids;
  state = (state ?? 2) ? 0 : 2;
  if (
    !state &&
    (ids = td[kStyleIds]) &&
    (ids = [].concat(...Object.values(ids))).length
  ) {
    // disable all applied styles
    if (!ovrs) {
      // first time toggling
      td[kTabOvrToggle] = [state, skip, ovrs = {...td[kTabOvr]}];
      for (const id of ids) ovrs[id] ??= null;
    }
    ovrs = {};
    for (const id of ids) ovrs[id] = false;
  } else if (!ovrs) {
    // no styles?
    return;
  } else if (state === 2) {
    // restore
  }
  td[kTabOvrToggle][0] = state;
  styleMan.toggleTabOvrMany(tab.id, ovrs);
}
