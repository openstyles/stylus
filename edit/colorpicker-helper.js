/* global CodeMirror loadScript editors */
'use strict';

window.initColorpicker = () => {
  onDOMready().then(() => {
    $('#colorpicker-settings').onclick = configureColorpicker;
  });
  const scripts = [
    '/vendor-overwrites/colorpicker/colorpicker.css',
    '/vendor-overwrites/colorpicker/colorpicker.js',
    '/vendor-overwrites/colorpicker/colorview.js',
  ];
  prefs.subscribe(['editor.colorpicker.hotkey'], registerHotkey);
  prefs.subscribe(['editor.colorpicker'], colorpickerOnDemand);
  return prefs.get('editor.colorpicker') && colorpickerOnDemand(null, true);

  function colorpickerOnDemand(id, enabled) {
    return loadScript(enabled && scripts)
      .then(() => setColorpickerOption(id, enabled));
  }

  function setColorpickerOption(id, enabled) {
    const defaults = CodeMirror.defaults;
    const keyName = prefs.get('editor.colorpicker.hotkey');
    delete defaults.extraKeys[keyName];
    defaults.colorpicker = enabled;
    if (enabled) {
      if (keyName) {
        CodeMirror.commands.colorpicker = invokeColorpicker;
        defaults.extraKeys[keyName] = 'colorpicker';
      }
      defaults.colorpicker = {
        forceUpdate: editors.length > 0,
        tooltip: t('colorpickerTooltip'),
        popupOptions: {
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
    }
    // on page load runs before CodeMirror.setOption is defined
    editors.forEach(cm => cm.setOption('colorpicker', defaults.colorpicker));
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

  function configureColorpicker() {
    const input = $element({
      tag: 'input',
      type: 'search',
      spellcheck: false,
      value: prefs.get('editor.colorpicker.hotkey'),
      onkeydown(event) {
        const key = CodeMirror.keyName(event);
        // ignore: [Shift?] characters, modifiers-only, [Shift?] Esc, Enter, [Shift?] Tab
        if (/^(Enter|(Shift-)?(Esc|Tab))$/.test(key)) {
          return;
        } else if (/^((Shift-)?[!-~]|(Shift-?|Ctrl-?|Alt-?|Cmd-?)*)$/.test(key)) {
          this.setCustomValidity('Not allowed');
        } else {
          this.setCustomValidity('');
          prefs.set('editor.colorpicker.hotkey', key);
        }
        event.preventDefault();
        event.stopPropagation();
        this.value = key;
      },
      oninput() {
        // fired on pressing "x" to clear the field
        prefs.set('editor.colorpicker.hotkey', '');
      },
      onpaste(event) {
        event.preventDefault();
      }
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
};
