import {configDialog, getEventKeyName, moveFocus} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import {getActiveTab} from '@/js/util-webext';
import {resortEntries, tabUrl} from '.';
import * as hotkeys from './hotkeys';

const menu = $id('menu');
const menuExclusions = [];

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
    menuHide();
  },
  '.copy'({target}) {
    navigator.clipboard.writeText(target.textContent);
    target.classList.add('copied');
    setTimeout(() => {
      target.classList.remove('copied');
    }, 1000);
  },
};

const EntryRoutes = {
  async input(event, entry) {
    event.stopPropagation(); // preventing .style-name from double-processing the click
    await API.styles.toggle(entry.styleId, this.checked);
    resortEntries();
  },
  '.configure': configure,
  '.menu-button'(event, entry) {
    if (!menuExclusions.length) menuInit();
    const exc = entry.styleMeta.exclusions || [];
    for (const x of menuExclusions) {
      x.el.title = x.rule;
      x.el.classList.toggle('enabled',
        x.input.checked = exc.includes(x.rule));
    }
    menu.classList.remove('delete');
    menu.styleId = entry.styleId;
    menu.hidden = false;
    window.on('keydown', menuOnKey);
    menu.$('header').textContent = entry.$('.style-name').textContent;
    moveFocus(menu, 0);
  },
  '.style-edit-link': openEditor,
  '.regexp-problem-indicator'(event, entry) {
    const info = template.regexpProblemExplanation.cloneNode(true);
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

function menuInit() {
  const u = new URL(tabUrl);
  for (const el of $$('[data-exclude]')) {
    const input = el.$('input');
    const rule = u.origin +
      (el.dataset.exclude === 'domain' ? '/*' : u.pathname.replace(/\*/g, '\\*'));
    menuExclusions.push({el, input, rule});
    input.onchange = () => {
      el.classList.toggle('enabled', input.checked);
      API.styles.toggleOverride(menu.styleId, rule, false, input.checked);
    };
  }
}

function menuHide() {
  menu.hidden = true;
  window.off('keydown', menuOnKey);
}

function menuOnKey(e) {
  switch (getEventKeyName(e)) {
    case 'Tab':
    case 'Shift-Tab':
      e.preventDefault();
      moveFocus(menu, e.shiftKey ? -1 : 1);
      break;
    case 'Escape': {
      e.preventDefault();
      menuHide();
      break;
    }
  }
}
