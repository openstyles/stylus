import '@/js/browser';
import {knownKeys, subscribe} from '@/js/prefs';

export default function initBrowserCommandsApi() {
  const browserCommands = browser.commands;
  if (!browserCommands?.update) return;
  subscribe(knownKeys.filter(k => k.startsWith('hotkey.')), async (name, value) => {
    try {
      if (value.trim()) {
        await browserCommands.update({
          name: name.split('.')[1],
          shortcut: value,
        });
      }
    } catch {}
  }, true);
}
