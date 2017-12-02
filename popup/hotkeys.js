/* global applyOnMessage installed */
'use strict';

window.addEventListener('showStyles:done', function _() {
  window.removeEventListener('showStyles:done', _);

  let togglablesShown = true;
  let togglables = getTogglables();

  window.addEventListener('keydown', onKeyDown);
  initHotkeyInfo();
  return;

  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    let entry;
    const k = event.which;
    if (k >= 48 && k <= 57 || k >= 96 && k <= 105) {
      // 0-9, numpad 0-9
      entry = installed.children[k === 48 || k === 96 ? 9 : k - (k > 96 ? 97 : 49)];
    } else if (k >= 65 && k <= 90) {
      // a-z
      const letter = new RegExp('^\\x' + k.toString(16), 'i');
      entry = [...installed.children].find(entry => letter.test(entry.textContent));
    } else if (k === 192 || k === 106) {
      // backtick ` and numpad *
      invertTogglables();
    } else if (k === 109) {
      // numpad -
      toggleState(installed.children, 'enabled', false);
    } else if (k === 107) {
      // numpad +
      toggleState(installed.children, 'disabled', true);
    }
    if (!entry) {
      return;
    }
    const target = $(event.shiftKey ? '.style-edit-link' : '.checker', entry);
    target.dispatchEvent(new MouseEvent('click'));
  }

  function getTogglables() {
    const all = [...installed.children];
    const enabled = [];
    for (const entry of all) {
      if (entry.classList.contains('enabled')) {
        enabled.push(entry.id);
      }
    }
    return enabled.length ? enabled : all.map(entry => entry.id);
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
        task = task.then(() => saveStyleSafe({
          id: entry.styleId,
          enabled: enable,
          notify: false,
        }));
      }
    }
    if (results.length) {
      task.then(refreshAllTabs);
    }
    return results;
  }

  function refreshAllTabs() {
    getStylesSafe({matchUrl: location.href, enabled: true, asHash: true})
      .then(styles => applyOnMessage({method: 'styleReplaceAll', styles}));
    queryTabs().then(tabs => {
      for (const tab of tabs) {
        // skip lazy-loaded aka unloaded tabs that seem to start loading on message in FF
        if (!FIREFOX || tab.width) {
          getStylesSafe({matchUrl: tab.url, enabled: true, asHash: true}).then(styles => {
            const message = {method: 'styleReplaceAll', styles, tabId: tab.id};
            invokeOrPostpone(tab.active, sendMessage, message, ignoreChromeError);
            setTimeout(BG.updateIcon, 0, tab, styles);
          });
        }
      }
    });
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
    }

    function open() {
      title = container.title;
      container.title = '';
      container.dataset.active = true;
      if (!container.firstElementChild) {
        buildElement();
      }
      const height = 4 +
        container.firstElementChild.scrollHeight +
        container.lastElementChild.scrollHeight +
        parseFloat(getComputedStyle(container.firstElementChild).paddingBottom) * 4;
      if (height > document.body.clientHeight) {
        document.body.style.height = height + 'px';
      }
    }

    function buildElement() {
      const keysToElements = line =>
        line
          .split(/(<.*?>)/)
          .map(s => (!s.startsWith('<') ? s :
            $element({tag: 'mark', textContent: s.slice(1, -1)})));
      const linesToElements = text =>
        text
          .trim()
          .split('\n')
          .map((line, i, array) =>
            $element(i < array.length - 1 ? {
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
        $element({tag: 'button', textContent: t('confirmOK')}),
      ].forEach(child => {
        container.appendChild($element({appendChild: child}));
      });
    }
  }
});
