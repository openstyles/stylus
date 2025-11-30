import {kStyleIdPrefix} from '@/js/consts';
import {configDialog, moveFocus} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import {getActiveTab} from '@/js/util-webext';
import {closeMenu, menu, renderMenu} from './menu';
import {tabId, tabUrl} from '.';
import * as hotkeys from './hotkeys';
import {createStyleElement, installed, resortEntries} from './render';

export async function handleUpdate({style, reason}) {
  const id = style.id;
  const entry = $id(kStyleIdPrefix + id);
  const inMenu = id === menu.styleId && menu.isConnected;
  if (reason !== 'toggle' || !entry) {
    [style] = await API.styles.getByUrl(tabUrl, id, tabId, inMenu);
    if (!style) {
      closeMenu();
      return;
    }
    style = Object.assign(style.style, style);
  }
  const el = createStyleElement(style, entry);
  if (!el.isConnected) installed.append(el);
  resortEntries();
  if (inMenu) renderMenu(el);
}

export function configure(event, entry) {
  if (!this.target) {
    hotkeys.pause(() => configDialog(entry.styleId));
  } else {
    openURLandHide.call(this, event);
  }
}

export function maybeEdit(event) {
  if (!(
    event.button === 0 && (event.ctrlKey || event.metaKey) ||
    event.button === 1 ||
    event.button === 2)) {
    return;
  }
  // open an editor on middleclick
  const el = event.target;
  if (el.matches('.entry, .style-edit-link') || el.closest('.style-name')) {
    this.onmouseup = () => this.$('.style-edit-link').click();
    this.oncontextmenu = e => e.preventDefault();
    event.preventDefault();
  }
}

export async function openEditor(event, entry) {
  event.preventDefault();
  await API.openEditor(this.search || {id: entry.styleId});
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

const GlobalRoutes = {
  '#installed:empty'() {
    $id('find-styles-btn').click();
  },
  '#menu [data-cmd]'() {
    if (this.dataset.cmd === 'delete') {
      if (menu.classList.toggle('delete')) return;
      API.styles.remove(menu.styleId);
    }
    closeMenu();
  },
  '.copy'({target}) {
    navigator.clipboard.writeText(target.textContent);
    target.classList.add('copied');
    setTimeout(() => {
      target.classList.remove('copied');
    }, 1000);
  },
};

export const EntryRoutes = {
  async input(event, entry = this) {
    event.stopPropagation(); // preventing .style-name from double-processing the click
    await API.styles.toggle(entry.styleId, this.checked);
    resortEntries();
  },
  '.configure': configure,
  '.menu-button'(event, entry) {
    renderMenu(entry);
    moveFocus(menu, 0);
  },
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

document.on('click', event => {
  const {target} = event;
  const entry = target.closest('.entry');
  for (let map = entry ? EntryRoutes : GlobalRoutes; ; map = GlobalRoutes) {
    const fn = map['.' + target.className] || map[target.localName];
    if (fn) return fn.call(target, event, entry);
    for (const selector in map) {
      for (let el = target; el && el !== entry; el = el.parentElement) {
        if (el.matches(selector)) {
          map[selector].call(el, event, entry);
          return;
        }
      }
    }
    if (map === GlobalRoutes) break;
  }
});
