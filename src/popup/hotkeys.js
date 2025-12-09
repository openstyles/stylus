import {kTabOvr} from '@/js/consts';
import {$createLink, $isTextInput} from '@/js/dom';
import {moveFocus} from '@/js/dom-util';
import {tBody} from '@/js/localization';
import {API} from '@/js/msg-api';
import {CHROME, MAC} from '@/js/ua';
import {t} from '@/js/util';
import {openEditor} from '@/popup/events';
import {styleFinder, tabId} from '.';
import {btnDel, closeMenu, menu, openMenu} from './menu';

tBody();

const entries = document.getElementsByClassName('entry');
const MENU_KEYS = {
  ContextMenu: 1,
  Enter: 1,
};
let infoOn;
let menuKey = 0;
let oldBodyStyle;
let toggledOn;
let togglables;
let wikiText;

initInfo();
getTogglables();
window.on('keydown', onKeyDown);

window.on('keyup', /** @param {KeyboardEvent} evt */ evt => {
  if (menuKey && !evt.repeat && MENU_KEYS[evt.key]) {
    if (menuKey > 1) evt.preventDefault();
    menuKey = 0;
  }
});

export async function pause(fn, ...args) {
  window.off('keydown', onKeyDown);
  await fn(...args);
  window.on('keydown', onKeyDown);
}

/** @param {KeyboardEvent} evt */
function onKeyDown(evt) {
  if (evt.metaKey)
    return;
  let entry;
  let {code, key, altKey, ctrlKey, shiftKey} = evt;
  const mods = (altKey ? '!' : '') + (ctrlKey ? '^' : '') + (shiftKey ? '+' : '');
  const mkey = mods + key;
  if (infoOn) {
    if (mkey === 'Escape') {
      evt.preventDefault();
      hideInfo();
    }
    return;
  }
  if (menu.isConnected) {
    if (mkey === 'Escape') {
      closeMenu();
    } else if (mkey === 'Tab' || mkey === '+Tab') {
      moveFocus(menu, shiftKey ? -1 : 1);
    } else if (mkey === 'F2') {
      openEditor(null, menu);
    } else if (mkey === 'Delete') {
      btnDel.click();
    } else if ((!mods || mods === '+') && (
      (key === '`' || code === 'Backquote') && (key = '0') ||
      key >= '0' && key <= '3' ||
      code >= 'Digit0' && code <= 'Digit3' && (key = code.slice(-1))
    )) {
      menu.$(`[data-index="${key}"] label:nth-of-type(${mods ? 2 : 1}) input`).click();
    } else {
      return;
    }
    evt.preventDefault();
    return;
  }
  if (ctrlKey) {
    if (mkey === '^f') {
      evt.preventDefault();
      $id('find-styles-btn').click();
    }
    return;
  }
  if (styleFinder.on && $isTextInput())
    return;
  if (key === '`' || key === '*' || code === 'Backquote') {
    if (!togglables.length) getTogglables();
    toggleState(togglables, toggledOn = !toggledOn, altKey);
  } else if (key === '-') {
    toggleState(entries, false, altKey);
  } else if (key === '+') {
    toggleState(entries, true, altKey);
  } else if (key >= '0' && key <= '9'
  || code >= 'Digit0' && code <= 'Digit9' && (key = code.slice(-1))) {
    entry = entries[(+key || 10) - 1];
  } else if (key === '?' && !altKey) {
    $('#help').click();
  } else if (MENU_KEYS[key]) {
    menuKey = 1;
  } else if (key.length === 1) {
    shiftKey = false; // typing ':' etc. needs Shift so we hide it here to avoid opening editor
    key = key.toLocaleLowerCase();
    entry = [...entries].find(e => e.innerText.toLocaleLowerCase().startsWith(key));
  }
  if (entry) {
    if (menuKey && ++menuKey) openMenu(entry);
    else if (altKey) toggleState([entry], null, true);
    else entry.$(shiftKey ? '.style-edit-link' : 'input').click();
  }
}

function getTogglables() {
  let num = 0;
  togglables = [];
  for (const el of $$('.entry.enabled')) {
    togglables.push(el.id);
    num += el.styleMeta[kTabOvr] !== false;
  }
  toggledOn = num >= togglables.length / 2;
}

/**
 * @param {HTMLElement[]} list
 * @param {boolean} enable
 * @param {boolean} [inTab]
 */
export function toggleState(list, enable, inTab) {
  const ids = [];
  for (let entry of list) {
    if (typeof entry === 'string' && !(entry = $id(entry)))
      continue;
    const style = entry.styleMeta;
    const {id, enabled, [kTabOvr]: ovr} = style;
    let siteOn;
    let tabOn;
    if (enable !== (inTab ? tabOn = ovr ?? (siteOn = !style.incOvr && enabled) : enabled)) {
      if (inTab) {
        API.styles.toggleOverride(id, tabId,
          enable ?? !tabOn,
          ovr == null || (ovr ? siteOn : !siteOn));
      } else {
        ids.push(id);
      }
    }
  }
  if (ids.length)
    API.styles.toggleMany(ids, enable);
}

function initInfo() {
  const el = $('#help');
  const tAll = t('popupHotkeysInfo');
  const tMenu = t('popupHotkeysInfoMenu');
  let tTab = t('popupHotkeysInfoTab');
  if (MAC) tTab = tTab.replace('<Alt>', '<⌥>');
  el.onShowNote = showInfo;
  el.onHideNote = hideInfo;
  el.title = `${tTab}\n${tMenu}\n${tAll}`;
  el.dataset.title = `${tTab}\n${tMenu}\n${tAll.replace(/\n.+$/, '')}`.replace(/\n/g, '<hr>');
  wikiText = tAll.match(/(.+)?$/)[0] || t('linkStylusWiki');
}

function hideInfo() {
  document.body.style.cssText = oldBodyStyle;
  infoOn = false;
}

/** @this {MessageBox} */
function showInfo(box) {
  const el = box.firstChild;
  const wikiUrl = 'https://github.com/openstyles/stylus/wiki/Popup';
  const a = $createLink({href: wikiUrl, title: CHROME ? wikiUrl : ''}, wikiText);
  const width = '23em';
  box.$('#message-box-buttons').append(a);
  box.classList.add('hotkeys');
  oldBodyStyle = document.body.style.cssText;
  el.setAttribute('style', `min-width:${width}; max-height:none !important;`);
  document.body.style.minWidth = width;
  document.body.style.minHeight = el.clientHeight + 24 + 'px';
  el.style.maxHeight = '';
  infoOn = true;
}
