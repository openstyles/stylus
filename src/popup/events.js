import {kSidebar, kStyleIdPrefix, UCD} from '@/js/consts';
import {isSidebar} from '@/js/dom';
import {configDialog} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import {__values, subscribe} from '@/js/prefs';
import {CHROME, MAC} from '@/js/ua';
import {t} from '@/js/util';
import {getActiveTab, browserSidebar} from '@/js/util-webext';
import {tabId, tabUrl} from '.';
import * as hotkeys from './hotkeys';
import {closeMenu, menu, openMenu} from './menu';
import {createStyleElement, installed, reSort} from './render';

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
  '.style-name': Object.assign((evt, entry) => {
    if (evt.button
    || !evt.button && (evt.altKey || evt.ctrlKey || MAC && evt.metaKey)
      && (evt.preventDefault()/*prevent toggling of checkbox*/, 1)
    ) {
      if (evt.altKey) hotkeys.toggleStateInTab([entry], null);
      else openEditor(evt, entry);
    }
  }, {
    btn: 1 + 2,
  }),
  async input(evt, entry = this) {
    await API.styles.toggle(entry.styleId, this.checked);
    reSort();
  },
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
  '.write-style-link': openEditor,
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
const pSideFinder = 'popup.sidePanel.finder';
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
subscribe(Object.keys(sideTitleMap), updateTitles, true);

if (__.BUILD !== 'firefox' && (__.MV3 || CHROME)) {
  /* Chrome retains user activation in oncontextmenu, which handles both keyboard & right-click,
   * and is also the event where preventDefault() can actually suppress the built-in menu. */
  window.oncontextmenu = evt => clickRouter(evt, 2);
  window.onclick = clickRouter;
  window.onauxclick = evt => {
    if (evt.button !== 2)
      clickRouter(evt);
  };
} else {
  /* Firefox retains user activation only in mouseXXX and keyXXX events. */
  let elClick;
  window.onmousedown = window.onkeydown = evt => {
    elClick = evt.target;
  };
  window.onmouseup = evt => {
    if (evt.target === elClick)
      elClick = !clickRouter(evt, undefined, elClick);
  };
  window.onkeyup = evt => {
    if (evt.target === elClick && !evt.metaKey && !evt.altKey && !evt.ctrlKey
    && (evt.key === (evt.shiftKey ? 'F10' : 'ContextMenu')))
      elClick = !clickRouter(evt, 2, elClick);
  };
  window.oncontextmenu = () => elClick; // `false` suppresses the menu
}

export async function handleUpdate({style}) {
  const id = style.id;
  const entry = $id(kStyleIdPrefix + id);
  const inMenu = id === menu.styleId && menu.isConnected;
  [style] = await API.styles.getByUrl(tabUrl, id, tabId, inMenu);
  if (style) {
    style = Object.assign(style.style, style);
    const el = createStyleElement(style, entry);
    if (!el.isConnected) installed.append(el);
    reSort();
    if (inMenu) openMenu(el);
  } else {
    entry?.remove();
    if (inMenu) closeMenu();
  }
}

/**
 * @param {MouseEvent|KeyboardEvent} event
 * @param {number} [btn]
 * @param {HTMLElement} [elClick]
 * @return {void|true}
 */
function clickRouter(event, btn = event.button, elClick = event.target) {
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
      }
      return true;
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
  this.disabled = true;
  if (!styleFinder.on) await import('./search');
  styleFinder[kSidebar] = event === kSidebar ? event :
    !isSidebar && browserSidebar
      ? button === 2 ? 0 : __values[pSideFinder]
      : undefined;
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

export async function sidebarOpen(path, keepOpen) {
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
  if (!keepOpen && !isSidebar)
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
