import {kStyleIdPrefix, UCD} from '@/js/consts';
import {configDialog} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import {__values} from '@/js/prefs';
import {CHROME, MAC} from '@/js/ua';
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
/** @type {{[sel: string]: OnClickHandler}} */
export const OnClick = {
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
  '.configure': Object.assign(configure, {
    btn: 1 + 2,
  }),
  '.menu-button': Object.assign((event, entry) => openMenu(entry), {
    btn: 2,
  }),
  '.style-edit-link': openEditor,
};
export const styleFinder = {};

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

Object.assign($('#find-styles-btn'), {
  onclick: openStyleFinder,
}).on('split-btn', async e => {
  if (!styleFinder.on) await import('./search');
  styleFinder.inSite(e);
});
Object.assign($('#popup-manage-button'), {
  onclick: openManager,
  oncontextmenu: openManager,
}).on('split-btn', openManager);

$('#options-btn').onclick = openOptions;

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
  if (!entry)
    return;
  let el = elClick;
  let fn = OnClick['.' + el.className] || OnClick[el.localName];
  for (const selector in OnClick) {
    if (fn || (fn = (el = elClick.closest(selector)) && OnClick[selector])) {
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
    if (browserSidebar && (
      button ||
      !(mode = __values['config.sidePanel']) ||
      mode > 0 && entry.styleMeta[UCD].vars >= mode
    )) {
      const p = `sidepanel.html?id=${entry.styleId}`;
      if (__.BUILD === 'chrome') {
        browserSidebar.setOptions({tabId, path: p});
        return browserSidebar.open({tabId});
      } else {
        browserSidebar.setPanel({tabId, panel: p});
        return browserSidebar.open();
      }
    }
    hotkeys.pause(() => configDialog(entry.styleId));
  } else {
    openURLandHide.call(this, event);
  }
}

export async function openEditor(event, entry) {
  await API.openEditor(entry ? {id: entry.styleId} : this.search);
  window.close();
}

export async function openManager(event) {
  event.preventDefault();
  const isSearch = tabUrl && (event.shiftKey || event.button === 2 || event.detail === 'site');
  await API.openManager(isSearch ? {search: tabUrl, searchMode: 'url'} : {});
  window.close();
}

export function openOptions() {
  API.openManager({options: true});
  close();
}

export async function openStyleFinder() {
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
  window.close();
}

export function toggleUrlLink({type}) {
  this.parentElement.classList.toggle('url()', type === 'mouseenter' || type === 'focus');
}
