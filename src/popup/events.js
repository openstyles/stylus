import {pSideManager, pSideOptions, UCD} from '@/js/consts';
import {isTouch} from '@/js/dom';
import {configDialog} from '@/js/dom-util';
import {template} from '@/js/localization';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {__values, subscribe} from '@/js/prefs';
import {FIREFOX, MAC} from '@/js/ua';
import {isSidebar, NOP, t} from '@/js/util';
import {browserSidebar, getActiveTab, openDashboard, openSidebar} from '@/js/util-webext';
import {tabId, tabUrl, windowId} from '.';
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
export const selUnstylable = '#unstylable';
/** @type {{[sel: string]: OnClickHandler}} */
export const EntryClick = {
  'input': nameRouter,
  '.style-name': Object.assign(nameRouter, {btn: 1 + 2}),
  [selConfig]: Object.assign(configure, {btn: 1 + 2}),
  '.menu-button': Object.assign((event, entry) => openMenu(entry), {btn: 2}),
  [selEdit]: openEditor,
};

/** All these handlers accept a right-click, `btn = 2` property is added below */
const GlobalClick = {
  'a[href*="edit.html"]': openEditor,
  [selFinder]: openStyleFinder,
  [selManager]: openManager,
  [selOptions]: openOptions,
};
export const styleFinder = {};
export const tSideHint = '\n' + t('popupSidePanelOpenHint');
export const pSideConfig = 'popup.sidePanel.config';
export const pSideFinder = 'popup.sidePanel.finder';
const pSideEditor = 'popup.sidePanel.editor';
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
$(selUnstylable + ' a').onShowNote = box => {
  box.classList.add('inline');
  $(selUnstylable).after(box);
};
$(selFinder).on('split-btn', async e => {
  if (!styleFinder.on) await import('./search');
  styleFinder.inSite(e);
});
$(selManager).title += '\n<Shift>: ' + t('popupManageSiteStyles');
$(selManager).on('split-btn', openManager);
if ((__.B_FIREFOX || __.B_ANY && FIREFOX) && isTouch)
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
  if (__.B_FIREFOX || __.B_ANY && FIREFOX) {
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

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
function nameRouter(event, entry, button) {
  if (event.altKey || button && this.localName === 'input') {
    hotkeys.toggleStateInTab([entry], null);
  } else if (button || event.ctrlKey || MAC && event.metaKey) {
    openEditor(event, entry);
  } else if (!button && !event.shiftKey) {
    API.styles.toggle(entry.styleId, !entry.styleMeta.enabled);
  }
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
export async function configure(event, entry, button) {
  if (!this.target) {
    let mode;
    if (!isSidebar && browserSidebar && (
      button ||
      !(mode = __values[pSideConfig]) ||
      mode > 0 && entry.styleMeta[UCD].vars >= mode
    )) {
      return openSidebar(`sidepanel.html?id=${entry.styleId}`, close, {tabId});
    }
    hotkeys.pause(() => configDialog(entry.styleId, entry.getBoundingClientRect().bottom));
  } else {
    openURLandHide.call(this, event);
  }
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
export async function openEditor(event, entry, button) {
  const params = entry ? '?id=' + entry.styleId : this.search;
  if (browserSidebar && (button === 2 || __values[pSideEditor])) {
    return openSidebar('edit.html' + params, close, {tabId});
  }
  await API.tabs.openEditor(params);
  if (!isSidebar)
    close();
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
function openManager(event, entry, button) {
  event?.preventDefault();
  return openDashboard(
    event.shiftKey || (/**@type{CustomEvent}*/event).detail === 'site'
      ? {search: tabUrl, searchMode: 'url'}
      : {},
    button === 2, close, {windowId});
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
export function openOptions(event, entry, button) {
  return openDashboard(null, button === 2, close, {windowId});
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {StyleEntryElement} [entry]
 * @param {number} [button]
 */
export async function openStyleFinder(event, entry, button) {
  if (browserSidebar && (button === 2 || __values[pSideFinder]))
    return openSidebar(`popup.html?${pSideFinder}`, close, {tabId});
  this.disabled = true;
  if (!styleFinder.on) await import('./search');
  styleFinder.inline();
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 */
export async function openURLandHide(event) {
  event.preventDefault();
  const tab = await getActiveTab();
  await API.tabs.open({
    url: this.href || this.dataset.href,
    index: tab && tab.index + 1,
  });
  if (!isSidebar)
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
