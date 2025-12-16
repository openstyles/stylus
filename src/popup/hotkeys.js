import {kStyleIdPrefix, kTabOvrToggle, kTabOvr} from '@/js/consts';
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
const isEnabled = () => $id(kStyleIdPrefix + togglables[0]).styleMeta.enabled;
let infoOn;
let menuKey = 0;
let oldBodyStyle;
let savedTabOvrs;
/** @typedef {number[] | StyleEntryElement<StyleObjMatch>[]} Togglables */
/** @type {Togglables} */
let togglables;
let toggledTab;
let toggledTabSkip;
let transform;
let wikiText;

window.on('keydown', onKeyDown);
window.on('keyup', /** @param {KeyboardEvent} evt */ evt => {
  if (menuKey && !evt.repeat && MENU_KEYS[evt.key]) {
    if (menuKey > 1) evt.preventDefault();
    menuKey = 0;
  }
});
$('#toggler').on('click', evt => {
  const el = evt.target;
  const cmd = el.dataset.toggle;
  if (!cmd)
    return;
  evt.preventDefault();
  const cycle = cmd[0] === '*';
  const enable = cmd[0] === '+';
  const list = cycle ? togglables : entries;
  if (cmd[1]) toggleStateInTab(list, cycle ? null : enable);
  else toggleState(list, cycle ? !isEnabled() : enable);
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
    if (!togglables.length) getTogglables(true);
    if (!togglables.length) return;
    if (!altKey) {
      toggleState(togglables, !isEnabled());
    } else if ((toggledTab = transform[toggledTab]) < 2) {
      toggleStateInTab(togglables, !!toggledTab);
    } else {
      API.styles.toggleTabOvrMany(tabId, savedTabOvrs);
    }
  } else if (key === '-') {
    (altKey ? toggleStateInTab : toggleState)(entries, false);
  } else if (key === '+') {
    (altKey ? toggleStateInTab : toggleState)(entries, true);
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
    else if (altKey) toggleStateInTab([entry], null);
    else entry.$(shiftKey ? '.style-edit-link' : 'input').click();
  }
}

function getTogglables(force) {
  if (!savedTabOvrs || !(
    togglables = Object.keys(savedTabOvrs).map(id => $id(kStyleIdPrefix + id)).filter(Boolean)
  )[0]) {
    const numOn = (togglables = [...$$('.entry.enabled')]).length;
    if (!numOn && force)
      togglables = [...entries];
    savedTabOvrs = {};
    let off = 0;
    for (let i = 0, el, id; (el = togglables[i]); i++) {
      id = togglables[i] = el.styleId;
      savedTabOvrs[id] = el.styleMeta[kTabOvr];
      off += el.classList.contains('not-applied');
    }
    toggledTab = off === numOn ? 0 : off ? 2 : 1;
    toggledTabSkip = off === numOn ? 0 : off ? -1 : 1;
    API.tabs.set(tabId, kTabOvrToggle,
      togglables[0] ? [toggledTab, toggledTabSkip, savedTabOvrs] : {undef: tabId});
  }
  transform = toggledTabSkip === 0 ? [1, 2, 1]
    : toggledTabSkip === 1 ? [2, 0, 0]
      : [1, 2, 0];
}

/**
 * @param {Togglables} list
 * @param {boolean|null} enable
 */
export function toggleState(list, enable) {
  const ids = [];
  for (let el of list)
    if ((el.id || (el = $id(kStyleIdPrefix + el))) && enable !== el.styleMeta.enabled)
      ids.push(el.styleId);
  if (ids.length)
    API.styles.toggleMany(ids, enable);
}

/**
 * @param {Togglables} list
 * @param {boolean|null} enable
 */
export function toggleStateInTab(list, enable) {
  let ids;
  for (let el of list) {
    if (el.id || (el = $id(kStyleIdPrefix + el))) {
      const style = el.styleMeta;
      const ovr = style[kTabOvr];
      const siteOn = !style.incOvr && style.enabled;
      const tabOn = ovr ?? siteOn;
      if (enable !== tabOn) {
        (ids ??= {})[style.id] = ovr == null || (ovr ? siteOn : !siteOn)
          ? enable ?? !tabOn
          : null;
      }
    }
  }
  if (ids)
    API.styles.toggleTabOvrMany(tabId, ids);
}

export function initHotkeys({[kTabOvrToggle]: ovrData}) {
  if (Array.isArray(ovrData))
    [toggledTab, toggledTabSkip, savedTabOvrs] = ovrData;
  getTogglables();
  const el = $('#help');
  const tAll = t('popupHotkeysInfo');
  const tMain = tAll.replace(/\n.+$/, '');
  const tWiki = tAll.match(/(.+)?$/)[0];
  const tMenu = t('popupHotkeysInfoMenu');
  let tTab = t('popupHotkeysInfoTab');
  if (MAC) tTab = tTab.replace('<Alt>', '<⌥>');
  el.onShowNote = showInfo;
  el.onHideNote = hideInfo;
  el.title = [tMain, tTab, tMenu].join('\n');
  el.dataset.title = el.title.replace(/\n/g, '<hr>');
  wikiText = tWiki || t('linkStylusWiki');
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
