import {kTabOvr} from '@/js/consts';
import {$createLink, $isTextInput} from '@/js/dom';
import {moveFocus} from '@/js/dom-util';
import {tBody} from '@/js/localization';
import {API} from '@/js/msg-api';
import {CHROME, MAC} from '@/js/ua';
import {t} from '@/js/util';
import {styleFinder, tabId} from '.';
import {closeMenu, menu} from './menu';

tBody();

const entries = document.getElementsByClassName('entry');
let infoOn;
let oldBodyHeight;
let toggledOn;
let togglables;
let wikiText;

initInfo();
getTogglables();
window.on('keydown', onKeyDown);

export async function pause(fn, ...args) {
  window.off('keydown', onKeyDown);
  await fn(...args);
  window.on('keydown', onKeyDown);
}

function onKeyDown(evt) {
  if (evt.metaKey)
    return;
  let entry;
  let {code, key, altKey, ctrlKey, shiftKey} = evt;
  const mkey = (altKey ? '!' : '') + (ctrlKey ? '^' : '') + (shiftKey ? '+' : '') + key;
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
  } else if (key >= '0' && key <= '9' || /^Digit\d$/.test(code) && (key = code.slice(-1))) {
    entry = entries[(+key || 10) - 1];
  } else if (key === '?' && !altKey) {
    $('#help').click();
  } else if (key.length === 1) {
    shiftKey = false; // typing ':' etc. needs Shift so we hide it here to avoid opening editor
    key = key.toLocaleLowerCase();
    entry = [...entries].find(e => e.innerText.toLocaleLowerCase().startsWith(key));
  }
  if (entry) {
    if (altKey) toggleState([entry], null, true);
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
  let tTab = t('popupHotkeysInfoTab');
  if (MAC) tTab = tTab.replace('<Alt>', '<⌥>');
  el.onShowNote = showInfo;
  el.onHideNote = hideInfo;
  el.title = `${tTab}\n${tAll}`;
  el.dataset.title = (tTab + '\n' + tAll.replace(/\n.+$/, '')).replace(/\n/g, '<hr>');
  wikiText = tAll.match(/(.+)?$/)[0] || t('linkStylusWiki');
}

function hideInfo() {
  document.body.style.minHeight = oldBodyHeight;
  infoOn = false;
}

/** @this {MessageBox} */
function showInfo(box) {
  const el = box.firstChild;
  const wikiUrl = 'https://github.com/openstyles/stylus/wiki/Popup';
  const a = $createLink({href: wikiUrl, title: CHROME ? wikiUrl : ''}, wikiText);
  box.$('#message-box-buttons').append(a);
  box.classList.add('hotkeys');
  oldBodyHeight = document.body.style.minHeight;
  el.setAttribute('style', 'max-height:none !important');
  document.body.style.minHeight = el.clientHeight + 24 + 'px';
  el.removeAttribute('style');
  infoOn = true;
}
