import {$, $$, $remove, getEventKeyName, moveFocus} from '/js/dom';
import {t} from '/js/localization';
import {API} from '/js/msg';
import {getActiveTab, require} from '/js/toolbox';
import {resortEntries, tabURL} from './index';

const menu = $('#menu');
const menuExclusions = [];
const Events = {
  async configure(event, entry) {
    if (!this.target) {
      const [style] = await Promise.all([
        API.styles.get(entry.styleId),
        require(['/popup/hotkeys']), /* global hotkeys */
        require(['/js/dlg/config-dialog']), /* global configDialog */
      ]);
      hotkeys.setState(false);
      await configDialog(style);
      hotkeys.setState(true);
    } else {
      Events.openURLandHide.call(this, event);
    }
  },
  maybeEdit(event) {
    if (!(
      event.button === 0 && (event.ctrlKey || event.metaKey) ||
      event.button === 1 ||
      event.button === 2)) {
      return;
    }
    // open an editor on middleclick
    const el = event.target;
    if (el.matches('.entry, .style-edit-link') || el.closest('.style-name')) {
      this.onmouseup = () => $('.style-edit-link', this).click();
      this.oncontextmenu = event => event.preventDefault();
      event.preventDefault();
      return;
    }
  },
  async openEditor(event, entry) {
    event.preventDefault();
    await API.openEditor(this.search || {id: entry.styleId});
    window.close();
  },
  async openManager(event) {
    event.preventDefault();
    const isSearch = tabURL && (event.shiftKey || event.button === 2 || event.detail === 'site');
    await API.openManage(isSearch ? {search: tabURL, searchMode: 'url'} : {});
    window.close();
  },
  async openURLandHide(event) {
    event.preventDefault();
    await API.openURL({
      url: this.href || this.dataset.href,
      index: (await getActiveTab()).index + 1,
    });
    window.close();
  },
  toggleUrlLink({type}) {
    this.parentElement.classList.toggle('url()', type === 'mouseenter' || type === 'focus');
  },
};

const GlobalRoutes = {
  '#menu [data-cmd]'() {
    if (this.dataset.cmd === 'delete') {
      if (menu.classList.toggle('delete')) return;
      API.styles.remove(menu.styleId);
    }
    menuHide();
  },
  '.copy'(event) {
    event.preventDefault();
    const target = document.activeElement;
    const message = $('.copy-message');
    navigator.clipboard.writeText(target.textContent);
    target.classList.add('copied');
    message.classList.add('show-message');
    setTimeout(() => {
      target.classList.remove('copied');
      message.classList.remove('show-message');
    }, 1000);
  },
};

const EntryRoutes = {
  async input(event, entry) {
    event.stopPropagation(); // preventing .style-name from double-processing the click
    await API.styles.toggle(entry.styleId, this.checked);
    resortEntries();
  },
  '.configure': Events.configure,
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
    $('header', menu).textContent = $('.style-name', entry).textContent;
    moveFocus(menu, 0);
  },
  '.style-edit-link': Events.openEditor,
  '.regexp-problem-indicator'(event, entry) {
    const info = t.template.regexpProblemExplanation.cloneNode(true);
    $remove('#' + info.id);
    entry.appendChild(info);
  },
  '#regexp-explanation a': Events.openURLandHide,
  '#regexp-explanation button'() {
    $('#regexp-explanation').remove();
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
  const u = new URL(tabURL);
  for (const el of $$('[data-exclude]')) {
    const input = $('input', el);
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

export default Events;
