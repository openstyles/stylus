import {kStyleIdPrefix} from '@/js/consts';
import {configDialog} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import {MAC} from '@/js/ua';
import {getActiveTab} from '@/js/util-webext';
import {tabId, tabUrl} from '.';
import {toggleState} from './hotkeys';
import * as hotkeys from './hotkeys';
import {closeMenu, menu, openMenu} from './menu';
import {createStyleElement, installed, resortEntries} from './render';

/** @type {{[sel: string]: (this: HTMLElement, evt: MouseEvent, entry?: HTMLElement) => any}} */
export const OnClick = {
  '.style-name': Object.assign((evt, entry) => {
    if (evt.button
    || !evt.button && (evt.altKey || evt.ctrlKey || MAC && evt.metaKey)
      && (evt.preventDefault()/*prevent toggling of checkbox*/, 1)
    ) {
      if (evt.altKey) toggleState([entry], null, true);
      else openEditor(evt, entry);
    }
  }, {
    btn1: true,
    btn2: true,
  }),
  async input(evt, entry = this) {
    await API.styles.toggle(entry.styleId, this.checked);
    resortEntries();
  },
  '.configure': configure,
  '.menu-button': Object.assign((event, entry) => openMenu(entry), {
    btn2: true,
  }),
  '.style-edit-link': openEditor,
  '.regexp-problem-indicator'(event, entry) {
    const info = template.regexpProblemExplanation.cloneNode(true);
    const a = info.$('#regexp-partial a');
    if (a) a.href = 'https://developer.mozilla.org/docs/Web/CSS/@document';
    $id(info.id)?.remove();
    entry.appendChild(info);
  },
  '#regexp-explanation a': openURLandHide,
  '#regexp-explanation button'() {
    $id('regexp-explanation').remove();
  },
};

installed.on('click', () => {
  if (!installed.firstChild)
    $id('find-styles-btn').click();
});
window.onclick =
window.onauxclick =
window.oncontextmenu = event => {
  let {button} = event;
  if (button === 1 && event.type !== 'auxclick'
  || button === 2 && event.type !== 'contextmenu')
    return;
  const {target} = event;
  const entry = target.closest('.entry');
  if (!entry)
    return;
  let el = target;
  let fn = OnClick['.' + el.className] || OnClick[el.localName];
  button = button && `btn${button}`;
  for (const selector in OnClick) {
    if (fn || (fn = (el = target.closest(selector)) && OnClick[selector])) {
      if (!button || fn[button]) {
        if (button) event.preventDefault();
        fn.call(el, event, entry);
      }
      return;
    }
  }
};

export async function handleUpdate({style}) {
  const id = style.id;
  const entry = $id(kStyleIdPrefix + id);
  const inMenu = id === menu.styleId && menu.isConnected;
  [style] = await API.styles.getByUrl(tabUrl, id, tabId, inMenu);
  if (style) {
    style = Object.assign(style.style, style);
    const el = createStyleElement(style, entry);
    if (!el.isConnected) installed.append(el);
    resortEntries();
    if (inMenu) openMenu(el);
  } else {
    entry?.remove();
    if (inMenu) closeMenu();
  }
}

/** @this {HTMLAnchorElement} either <a target=_blank href=...> or <a> for a config icon */
export function configure(event, entry) {
  if (!this.target) {
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
