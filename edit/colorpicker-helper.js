/* global CodeMirror loadScript editors showHelp */
'use strict';

onDOMscriptReady('/colorview.js').then(() => {
  initOverlayHooks();
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
    } else {
      CodeMirror.modeExtensions.css.unregisterColorviewHooks();
      if (defaults.extraKeys) {
        delete defaults.extraKeys[keyName];
      }
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
    const input = $create('input', {
      type: 'search',
      spellcheck: false,
      value: prefs.get('editor.colorpicker.hotkey'),
      onkeydown(event) {
        event.preventDefault();
        event.stopPropagation();
        const key = CodeMirror.keyName(event);
        switch (key) {
          case 'Enter':
            if (this.checkValidity()) {
              $('#help-popup .dismiss').onclick();
            }
            return;
          case 'Esc':
            $('#help-popup .dismiss').onclick();
            return;
          default:
            // disallow: [Shift?] characters, modifiers-only, [modifiers?] + Esc, Tab, nav keys
            if (!key || new RegExp('^(' + [
              '(Back)?Space',
              '(Shift-)?.', // a single character
              '(Shift-?|Ctrl-?|Alt-?|Cmd-?){0,2}(|Esc|Tab|(Page)?(Up|Down)|Left|Right|Home|End|Insert|Delete)',
            ].join('|') + ')$', 'i').test(key)) {
              this.value = key || this.value;
              this.setCustomValidity('Not allowed');
              return;
            }
        }
        this.value = key;
        this.setCustomValidity('');
        prefs.set('editor.colorpicker.hotkey', key);
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

  function initOverlayHooks() {
    const COLORVIEW_DISABLED_SUFFIX = ' colorview-disabled';
    const COLORVIEW_NEXT_DISABLED_SUFFIX = ' colorview-next-disabled';
    const originalAddOverlay = CodeMirror.prototype.addOverlay;
    CodeMirror.prototype.addOverlay = addOverlayHook;

    function addOverlayHook(overlay) {
      if (overlay.token !== tokenHook && (
          overlay === (this.state.matchHighlighter || {}).overlay ||
          overlay === (this.state.search || {}).overlay)) {
        overlay.colopickerHelper = {token: overlay.token};
        overlay.token = tokenHook;
      }
      originalAddOverlay.apply(this, arguments);
    }

    function tokenHook(stream) {
      const style = this.colopickerHelper.token.apply(this, arguments);
      if (!style) {
        return style;
      }
      const {start, pos, lineOracle: {baseTokens}} = stream;
      if (!baseTokens) {
        return style;
      }
      for (let prev = 0, i = 1; i < baseTokens.length; i += 2) {
        const end = baseTokens[i];
        if (prev <= start && start <= end) {
          const base = baseTokens[i + 1];
          if (base && base.includes('colorview')) {
            return style +
              (start > prev ? COLORVIEW_DISABLED_SUFFIX : '') +
              (pos < end ? COLORVIEW_NEXT_DISABLED_SUFFIX : '');
          }
        } else if (end > pos) {
          break;
        }
        prev = end;
      }
      return style;
    }
  }
});
