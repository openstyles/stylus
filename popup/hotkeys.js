/* global applyOnMessage installed */
'use strict';

window.addEventListener('showStyles:done', function _() {
  window.removeEventListener('showStyles:done', _);

  let togglablesShown = true;
  let togglables = getTogglables();

  window.addEventListener('keydown', onKeyDown);
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
});
