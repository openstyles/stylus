import {kSidebar, UCD} from '@/js/consts';
import {isSidebar, isTouch} from '@/js/dom';
import {configDialog} from '@/js/dom-util';
import {template} from '@/js/localization';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {__values, subscribe} from '@/js/prefs';
import {FIREFOX, MAC} from '@/js/ua';
import {NOP, t} from '@/js/util';
import {getActiveTab, browserSidebar} from '@/js/util-webext';
import {tabId, tabUrl} from '.';
import * as hotkeys from './hotkeys';
import {openMenu} from './menu';
import {installed, updateStyleEntry} from './render';

/**
 * @callback OnClickHandler
 * @this {HTMLElement}
 * @param {MouseEvent} evt
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
const selConfig = '.configure';
const selEdit = '.style-edit-link';
const selFinder = '#find-styles-btn';
const selManager = '#popup-manage-button';
const selOptions = '#options-btn';
/** @type {{[sel: string]: OnClickHandler}} */
export const EntryClick = {
  '.style-name': Object.assign((evt, entry, button) => {
    if (evt.altKey) {
      hotkeys.toggleStateInTab([entry], null);
    } else if (button || evt.ctrlKey || MAC && evt.metaKey) {
      openEditor(evt, entry);
    } else if (!button && !evt.shiftKey) {
      API.styles.toggle(entry.styleId, !entry.$('input').checked);
    }
  }, {
    btn: 1 + 2,
  }),
  [selConfig]: Object.assign(configure, {
    btn: 1 + 2,
  }),
  '.menu-button': Object.assign((event, entry) => openMenu(entry), {
    btn: 2,
  }),
  [selEdit]: openEditor,
};

/** All these handlers accept a right-click, `btn = 2` property is added below */
const GlobalClick = {
  'a[href*="edit.html"]': openEditor,
  [selManager + '~ .split-btn-menu a'](evt, ...args) {
    openManager(null, ...args);
  },
  [selFinder]: openStyleFinder,
  [selManager]: openManager,
  [selOptions]: openOptions,
};
export const styleFinder = {};
export const tSideHint = '\n' + t('popupSidePanelOpenHint');
export const pSideConfig = 'popup.sidePanel.config';
export const pSideFinder = 'popup.sidePanel.finder';
const pSideEditor = 'popup.sidePanel.editor';
const pSideManager = 'popup.sidePanel.manager';
const pSideOptions = 'popup.sidePanel.options';
const sideTitleMap = {
  [pSideEditor]: selEdit + ', #write-wrapper a',
  [pSideManager]: selManager,
  [pSideOptions]: selOptions,
  ...!isSidebar && {
    [pSideConfig]: selConfig,
    [pSideFinder]: selFinder,
  },
};

for (const sel in GlobalClick)
  GlobalClick[sel].btn = 2;
$(selFinder).on('split-btn', async e => {
  if (!styleFinder.on) await import('./search');
  styleFinder.inSite(e);
});
$(selManager).title += t('popupManageSiteStyles');
$(selManager).on('split-btn', openManager);
if (__.BUILD !== 'chrome' && FIREFOX && isTouch)
  installed.on('click', NOP); // Fenec bug workaround: wrong action element in click event
subscribe(Object.keys(sideTitleMap), updateTitles, true);
onMessage.set(({method, reason, style}) => {
  if (!tabUrl)
    return;
  const del = method === 'styleDeleted';
  const busy = (del || method === 'styleAdded' || method === 'styleUpdated')
    && !/^editPreview/.test(reason)
    && updateStyleEntry(style.id, del);
  if (busy) styleFinder.on?.(method, style.id, busy);
});

let hideContextMenu;
window.on('auxclick', clickRouter, true);
window.on('click', clickRouter, true);
if (browserSidebar) {
  window.on('contextmenu',
    evt => hideContextMenu
      ? evt.preventDefault() // suppress the menu if already handled in auxclick,
      : clickRouter(evt, 2), // otherwise handle keyboard activated contextmenu
    true);
  if (__.BUILD !== 'chrome' && FIREFOX) {
    /* Firefox doesn't retain user activation in oncontextmenu,
       so we use it only to suppress the menu, while handling it via onkey.
       Using onkeydown because it fires before oncontextmenu and sets hideContextMenu. */
    window.on('keydown', evt => {
      if (!evt.metaKey && !evt.altKey && !evt.ctrlKey
      && (evt.key === (evt.shiftKey ? 'F10' : 'ContextMenu')))
        clickRouter(evt, 2);
    }, true);
  }
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {number} [btn]
 */
function clickRouter(event, btn = event.button) {
  hideContextMenu = false;
  const elClick = event.target;
  const entry = elClick.closest('.entry');
  const scope = entry ? EntryClick : GlobalClick;
  let el = elClick;
  let fn = entry
    ? scope['.' + el.className] || scope[el.localName]
    : scope['#' + el.id] || scope['.' + el.className] || scope[el.localName];
  for (const selector in scope) {
    if (fn || (fn = (el = elClick.closest(selector)) && scope[selector])) {
      if (!btn || fn.btn & /* using binary AND */btn) {
        event.preventDefault();
        fn.call(el, event, entry, btn);
        hideContextMenu = event.type !== 'contextmenu';
        return;
      }
    }
  }
}

export async function configure(event, entry, button) {
  if (!this.target) {
    let mode;
    if (!isSidebar && browserSidebar && (
      button ||
      !(mode = __values[pSideConfig]) ||
      mode > 0 && entry.styleMeta[UCD].vars >= mode
    )) {
      return sidebarOpen(`sidepanel.html?id=${entry.styleId}`);
    }
    hotkeys.pause(() => configDialog(entry.styleId, entry.getBoundingClientRect().bottom));
  } else {
    openURLandHide.call(this, event);
  }
}

export async function openEditor(event, entry, button) {
  const params = entry ? '?id=' + entry.styleId : this.search;
  if (browserSidebar && (button === 2 || __values[pSideEditor])) {
    return sidebarOpen('edit.html' + params);
  }
  await API.openEditor(params);
  if (!isSidebar)
    close();
}

export async function openManager(event, entry, button) {
  event?.preventDefault();
  const params = tabUrl && (!event || event.shiftKey)
    ? {search: tabUrl, searchMode: 'url'}
    : {};
  if (browserSidebar && (button === 2 || __values[pSideManager])) {
    return sidebarOpen('manage.html?' + new URLSearchParams(params));
  }
  await API.openManager(params);
  if (!isSidebar)
    close();
}

export async function openOptions(event, entry, button) {
  if (browserSidebar && (button === 2 || __values[pSideOptions])) {
    return sidebarOpen('options.html');
  }
  await API.openManager({options: true});
  if (!isSidebar)
    close();
}

export async function openStyleFinder(event, entry, button) {
  if (browserSidebar && (button === 2 || __values[pSideFinder]))
    return sidebarOpen(`popup.html?${pSideFinder}`);
  this.disabled = true;
  if (!styleFinder.on) await import('./search');
  styleFinder.inline();
}

export async function openURLandHide(event) {
  event.preventDefault();
  await API.openURL({
    url: this.href || this.dataset.href,
    index: (await getActiveTab()).index + 1,
  });
  if (!isSidebar)
    close();
}

export async function sidebarOpen(path) {
  path += (path.includes('?') ? '&' : '?') + kSidebar;
  if (isSidebar) {
    location.assign(path);
    return;
  }
  if (__.BUILD === 'chrome') {
    browserSidebar.setOptions({tabId, path});
    await browserSidebar.open({tabId});
  } else {
    browserSidebar.setPanel({tabId, panel: path});
    await browserSidebar.open();
  }
  close();
}

function updateTitle(el, alwaysSidebar) {
  const title = el.title;
  const i = title.indexOf(tSideHint);
  if (!alwaysSidebar && i < 0)
    el.title = title + tSideHint;
  else if (alwaysSidebar && i > 0)
    el.title = title.slice(0, i);
}

function updateTitles(id, alwaysSidebar) {
  if (typeof alwaysSidebar === 'number')
    alwaysSidebar = alwaysSidebar === 0;
  if (id === pSideEditor)
    updateTitle(template.style.$(selEdit), alwaysSidebar);
  for (const el of $$(sideTitleMap[id]))
    updateTitle(el, alwaysSidebar);
}
