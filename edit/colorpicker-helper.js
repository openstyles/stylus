'use strict';

define(require => {
  const prefs = require('/js/prefs');
  const t = require('/js/localization');
  const {createHotkeyInput, helpPopup} = require('./util');
  const {CodeMirror, globalSetOption} = require('./codemirror-factory');

  prefs.subscribe('editor.colorpicker.hotkey', registerHotkey);
  prefs.subscribe('editor.colorpicker', setColorpickerOption, {runNow: true});

  function setColorpickerOption(id, enabled) {
    const defaults = CodeMirror.defaults;
    const keyName = prefs.get('editor.colorpicker.hotkey');
    defaults.colorpicker = enabled;
    if (enabled) {
      if (keyName) {
        CodeMirror.commands.colorpicker = invokeColorpicker;
        defaults.extraKeys = defaults.extraKeys || {};
        defaults.extraKeys[keyName] = 'colorpicker';
      }
      defaults.colorpicker = {
        tooltip: t('colorpickerTooltip'),
        popup: {
          tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
          paletteLine: t('numberedLine'),
          paletteHint: t('colorpickerPaletteHint'),
          hexUppercase: prefs.get('editor.colorpicker.hexUppercase'),
          embedderCallback: state => {
            ['hexUppercase', 'color']
              .filter(name => state[name] !== prefs.get('editor.colorpicker.' + name))
              .forEach(name => prefs.set('editor.colorpicker.' + name, state[name]));
          },
          get maxHeight() {
            return prefs.get('editor.colorpicker.maxHeight');
          },
          set maxHeight(h) {
            prefs.set('editor.colorpicker.maxHeight', h);
          },
        },
      };
    } else {
      if (defaults.extraKeys) {
        delete defaults.extraKeys[keyName];
      }
    }
    globalSetOption('colorpicker', defaults.colorpicker);
  }

  function registerHotkey(id, hotkey) {
    CodeMirror.commands.colorpicker = invokeColorpicker;
    const extraKeys = CodeMirror.defaults.extraKeys;
    for (const key in extraKeys) {
      if (extraKeys[key] === 'colorpicker') {
        delete extraKeys[key];
        break;
      }
    }
    if (hotkey) {
      extraKeys[hotkey] = 'colorpicker';
    }
  }

  function invokeColorpicker(cm) {
    cm.state.colorpicker.openPopup(prefs.get('editor.colorpicker.color'));
  }

  function configureColorpicker(event) {
    event.preventDefault();
    const input = createHotkeyInput('editor.colorpicker.hotkey', () => helpPopup.close());
    const popup = helpPopup.show(t('helpKeyMapHotkey'), input);
    const bounds = this.getBoundingClientRect();
    popup.style.left = bounds.right + 10 + 'px';
    popup.style.top = bounds.top - popup.clientHeight / 2 + 'px';
    popup.style.right = 'auto';
    input.focus();
  }

  return configureColorpicker;
});
