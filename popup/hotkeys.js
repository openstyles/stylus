/* global $ $$ API debounce $create t */
'use strict';

/* exported hotkeys */
const hotkeys = (() => {
  const entries = document.getElementsByClassName('entry');
  let togglablesShown;
  let togglables;
  let enabled = false;
  let ready = false;

  window.addEventListener('showStyles:done', function _() {
    window.removeEventListener('showStyles:done', _);
    togglablesShown = true;
    togglables = getTogglables();
    ready = true;
    setState(true);
    initHotkeyInfo();
  });

  window.addEventListener('resize', adjustInfoPosition);

  return {setState};

  function setState(newState = !enabled) {
    if (!ready) {
      throw new Error('hotkeys no ready');
    }
    if (newState !== enabled) {
      window[`${newState ? 'add' : 'remove'}EventListener`]('keydown', onKeyDown);
      enabled = newState;
    }
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || !enabled) {
      return;
    }
    let entry;
    const {which: k, key, code} = event;

    if (code.startsWith('Digit') || code.startsWith('Numpad') && code.length === 7) {
      entry = entries[(Number(code.slice(-1)) || 10) - 1];

    } else if (
        code === 'Backquote' || code === 'NumpadMultiply' ||
        key && (key === '`' || key === '*') ||
        k === 192 || k === 106) {
      invertTogglables();

    } else if (
        code === 'NumpadSubtract' ||
        key && key === '-' ||
        k === 109) {
      toggleState(entries, 'enabled', false);

    } else if (
        code === 'NumpadAdd' ||
        key && key === '+' ||
        k === 107) {
      toggleState(entries, 'disabled', true);

    } else if (
    // any single character
        key && key.length === 1 ||
        k >= 65 && k <= 90) {
      const letter = new RegExp(key ? '^' + key : '^\\x' + k.toString(16), 'i');
      entry = [...entries].find(entry => letter.test(entry.textContent));
    }
    if (!entry) {
      return;
    }
    const target = $(event.shiftKey ? '.style-edit-link' : '.checker', entry);
    target.dispatchEvent(new MouseEvent('click', {cancelable: true}));
  }

  function getTogglables() {
    const enabledOrAll = $('.entry.enabled') ? $$('.entry.enabled') : [...entries];
    return enabledOrAll.map(entry => entry.id);
  }

  function countEnabledTogglables() {
    let num = 0;
    for (const id of togglables) {
      num += $(`#${id}`).classList.contains('enabled');
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
      entry = typeof entry === 'string' ? $('#' + entry) : entry;
      if (!match && $('.checker', entry).checked !== enable || entry.classList.contains(match)) {
        results.push(entry.id);
        task = task
          .then(() => API.toggleStyle(entry.styleId, enable))
          .then(() => {
            entry.classList.toggle('enabled', enable);
            entry.classList.toggle('disabled', !enable);
            $('.checker', entry).checked = enable;
          });
      }
    }
    if (results.length) task.then(API.refreshAllTabs);
    return results;
  }

  function initHotkeyInfo() {
    const container = $('#hotkey-info');
    let title;
    container.onclick = ({target}) => {
      if (target.localName === 'button') {
        close();
      } else if (!container.dataset.active) {
        open();
      }
    };

    function close() {
      delete container.dataset.active;
      document.body.style.height = '';
      container.title = title;
      window.addEventListener('resize', adjustInfoPosition);
    }

    function open() {
      window.removeEventListener('resize', adjustInfoPosition);
      debounce.unregister(adjustInfoPosition);
      title = container.title;
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
          .map((line, i, array) =>
            $create(i < array.length - 1 ? {
              tag: 'p',
              appendChild: keysToElements(line),
            } : {
              tag: 'a',
              target: '_blank',
              href: 'https://github.com/openstyles/stylus/wiki/Popup',
              textContent: line,
            }));
      [
        linesToElements(t('popupHotkeysInfo')),
        $create('button', t('confirmOK')),
      ].forEach(child => {
        container.appendChild($create('div', child));
      });
    }
  }

  function adjustInfoPosition(debounced) {
    if (debounced !== true) {
      debounce(adjustInfoPosition, 100, true);
      return;
    }
  }
})();
