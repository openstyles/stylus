import {$create, $createLink} from '@/js/dom';
import {tBody} from '@/js/localization';
import {API} from '@/js/msg-api';
import {t} from '@/js/util';

tBody();

const entries = document.getElementsByClassName('entry');
const container = $id('hotkey-info');
const {title} = container;
let togglablesShown = true;
let togglables = getTogglables();
let enabled;

initHotkeyInfo();
setState(true);

export async function pause(fn, ...args) {
  setState(false);
  await fn(...args);
  setState(true);
}

function setState(newState = !enabled) {
  if (!newState !== !enabled) {
    window[newState ? 'on' : 'off']('keydown', onKeyDown, true);
    enabled = newState;
  }
}

function onKeyDown(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || !enabled ||
      /^(text|search)$/.test(document.activeElement?.type)) {
    return;
  }
  let entry;
  let {key, code, shiftKey} = event;
  if (key === 'Escape' && !shiftKey && container.dataset.active) {
    event.preventDefault();
    hideInfo();
    return;
  }
  if (key >= '0' && key <= '9') {
    entry = entries[(Number(key) || 10) - 1];
  } else if (code >= 'Digit0' && code <= 'Digit9') {
    entry = entries[(Number(code.slice(-1)) || 10) - 1];
  } else if (key === '`' || key === '*' || code === 'Backquote' || code === 'NumpadMultiply') {
    invertTogglables();
  } else if (key === '-' || code === 'NumpadSubtract') {
    toggleState(entries, 'enabled', false);
  } else if (key === '+' || code === 'NumpadAdd') {
    toggleState(entries, 'disabled', true);
  } else if (key.length === 1) {
    shiftKey = false; // typing ':' etc. needs Shift so we hide it here to avoid opening editor
    key = key.toLocaleLowerCase();
    entry = [...entries].find(e => e.innerText.toLocaleLowerCase().startsWith(key));
  }
  entry?.$(shiftKey ? '.style-edit-link' : 'input').click();
}

function getTogglables() {
  return [...$('.entry.enabled') ? $$('.entry.enabled') : entries]
    .map(entry => entry.id);
}

function countEnabledTogglables() {
  let num = 0;
  for (const id of togglables) {
    num += $id(id).classList.contains('enabled');
  }
  return num;
}

function invertTogglables() {
  togglables = togglables.length ? togglables : getTogglables();
  togglablesShown = countEnabledTogglables() > togglables.length / 2;
  toggleState(togglables, null, !togglablesShown);
  togglablesShown = !togglablesShown;
}

function toggleState(list, match, enable) {
  const results = [];
  let task = Promise.resolve();
  for (let entry of list) {
    entry = typeof entry === 'string' ? $id(entry) : entry;
    if (!match && entry.$('input').checked !== enable || entry.classList.contains(match)) {
      results.push(entry.id);
      task = task
        .then(() => API.styles.toggle(entry.styleId, enable))
        .then(() => {
          entry.classList.toggle('enabled', enable);
          entry.classList.toggle('disabled', !enable);
          entry.$('input').checked = enable;
        });
    }
  }
  if (results.length) task.then(API.refreshAllTabs);
  return results;
}

function hideInfo() {
  delete container.dataset.active;
  document.body.style.height = '';
  container.title = title;
}

function initHotkeyInfo() {
  container.onclick = ({target}) => {
    if (target.localName === 'button') {
      hideInfo();
    } else if (!container.dataset.active) {
      open();
    }
  };

  function open() {
    container.title = '';
    container.style = '';
    container.dataset.active = true;
    if (!container.firstElementChild) {
      buildElement();
    }
    const height = 3 +
      container.firstElementChild.scrollHeight +
      container.lastElementChild.scrollHeight;
    if (height > document.body.clientHeight) {
      document.body.style.height = height + 'px';
    }
  }

  function buildElement() {
    const keysToElements = line =>
      line
        .split(/(<.*?>)/)
        .map(s => (!s.startsWith('<') ? s :
          $create('mark', s.slice(1, -1))));
    const linesToElements = text =>
      text
        .trim()
        .split('\n')
        .map((line, i, array) => i < array.length - 1
          ? $create('p', keysToElements(line))
          : $createLink('https://github.com/openstyles/stylus/wiki/Popup', line));
    [
      linesToElements(t('popupHotkeysInfo')),
      $create('button', t('confirmOK')),
    ].forEach(child => {
      container.appendChild($create('div', child));
    });
  }
}
