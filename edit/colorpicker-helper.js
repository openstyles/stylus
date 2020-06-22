/* global CodeMirror showHelp cmFactory onDOMready $ prefs t createHotkeyInput */
'use strict';

(() => {
  onDOMready().then(() => {
    $('#colorpicker-settings').onclick = configureColorpicker;
  });
  prefs.subscribe(['editor.colorpicker.hotkey'], registerHotkey);
  prefs.subscribe(['editor.colorpicker'], setColorpickerOption);
  setColorpickerOption(null, prefs.get('editor.colorpicker'));

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
        // FIXME: who uses this?
        // forceUpdate: editor.getEditors().length > 0,
        tooltip: t('colorpickerTooltip'),
        popup: {
          tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
          hexUppercase: prefs.get('editor.colorpicker.hexUppercase'),
          hideDelay: 5000,
          embedderCallback: state => {
            ['hexUppercase', 'color']
              .filter(name => state[name] !== prefs.get('editor.colorpicker.' + name))
              .forEach(name => prefs.set('editor.colorpicker.' + name, state[name]));
          },
        },
      };
    } else {
      if (defaults.extraKeys) {
        delete defaults.extraKeys[keyName];
      }
    }
    cmFactory.setOption('colorpicker', defaults.colorpicker);
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
    const input = createHotkeyInput('editor.colorpicker.hotkey', () => {
      $('#help-popup .dismiss').onclick();
    });
    const popup = showHelp(t('helpKeyMapHotkey'), input);
    if (this instanceof Element) {
      const bounds = this.getBoundingClientRect();
      popup.style.left = bounds.right + 10 + 'px';
      popup.style.top = bounds.top - popup.clientHeight / 2 + 'px';
      popup.style.right = 'auto';
    }
    input.focus();
  }
})();
