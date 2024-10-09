import browser from '/js/browser';
import {knownKeys, subscribe} from '/js/prefs';
import {FIREFOX} from '/js/toolbox';

if (FIREFOX && (browser.commands?.update)) {
  subscribe(knownKeys.filter(k => k.startsWith('hotkey.')), async (name, value) => {
    try {
      if (value.trim()) {
        await browser.commands.update({
          name: name.split('.')[1],
          shortcut: value,
        });
      }
    } catch (e) {}
  }, true);
}
