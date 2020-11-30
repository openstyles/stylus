'use strict';

/*
 Registers hotkeys in FF
 */

define(require => {
  const prefs = require('/js/prefs');

  const hotkeyPrefs = Object.keys(prefs.defaults).filter(k => k.startsWith('hotkey.'));
  prefs.subscribe(hotkeyPrefs, updateHotkey, {runNow: true});

  async function updateHotkey(name, value) {
    try {
      name = name.split('.')[1];
      if (value.trim()) {
        await browser.commands.update({name, shortcut: value});
      } else {
        await browser.commands.reset(name);
      }
    } catch (e) {}
  }
});
