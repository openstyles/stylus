/*
global CodeMirror loadScript
global editor ownTabId
global messageBox
*/
'use strict';

onDOMscriptReady('/codemirror.js').then(() => {
  const COMMANDS = {
    save,
    toggleStyle,
    toggleEditorFocus,
    jumpToLine,
    nextEditor, prevEditor,
    commentSelection,
  };
  const ORIGINAL_COMMANDS = {
    insertTab: CodeMirror.commands.insertTab,
  };
  // reroute handling to nearest editor when keypress resolves to one of these commands
  const REROUTED = new Set([
    'save',
    'toggleStyle',
    'jumpToLine',
    'nextEditor', 'prevEditor',
    'toggleEditorFocus',
    'find', 'findNext', 'findPrev', 'replace', 'replaceAll',
    'colorpicker',
  ]);
  Object.assign(CodeMirror.prototype, {
    // getSection,
    rerouteHotkeys,
  });
  Object.assign(CodeMirror.commands, COMMANDS);
  rerouteHotkeys(true);

  CodeMirror.defineInitHook(cm => {
    if (!cm.display.wrapper.closest('#sections')) {
      return;
    }
    if (prefs.get('editor.autocompleteOnTyping')) {
      setupAutocomplete(cm);
    }
    const wrapper = cm.display.wrapper;
    cm.on('blur', () => {
      cm.rerouteHotkeys(true);
      setTimeout(() => {
        wrapper.classList.toggle('CodeMirror-active', wrapper.contains(document.activeElement));
      });
    });
    cm.on('focus', () => {
      cm.rerouteHotkeys(false);
      wrapper.classList.add('CodeMirror-active');
    });
  });

  // FIXME: pull this into a module
  window.rerouteHotkeys = rerouteHotkeys;

  prefs.subscribe(null, onPrefChanged);

  ////////////////////////////////////////////////

  function getOption(o) {
    return CodeMirror.defaults[o];
  }

  function setOption(o, v) {
    CodeMirror.defaults[o] = v;
    if (!editor) {
      return;
    }
    const editors = editor.getEditors();
    if (editors.length > 4 && (o === 'theme' || o === 'lineWrapping')) {
      throttleSetOption({key: o, value: v, index: 0});
      return;
    }
    editors.forEach(editor => {
      editor.setOption(o, v);
    });
  }

  function throttleSetOption({
    key,
    value,
    index,
    timeStart = performance.now(),
    cmStart = editor.getLastActivatedEditor(),
    editorsCopy = editor.getEditors().slice(),
    progress,
  }) {
    if (index === 0) {
      if (!cmStart) {
        return;
      }
      cmStart.setOption(key, value);
    }

    const THROTTLE_AFTER_MS = 100;
    const THROTTLE_SHOW_PROGRESS_AFTER_MS = 100;

    const t0 = performance.now();
    const total = editorsCopy.length;
    const editors = editor.getEditors();
    while (index < total) {
      const cm = editorsCopy[index++];
      if (cm === cmStart ||
          cm !== editors[index] && !editors.includes(cm)) {
        continue;
      }
      cm.setOption(key, value);
      if (performance.now() - t0 > THROTTLE_AFTER_MS) {
        break;
      }
    }
    if (index >= total) {
      $.remove(progress);
      return;
    }
    if (!progress &&
        index < total / 2 &&
        t0 - timeStart > THROTTLE_SHOW_PROGRESS_AFTER_MS) {
      let option = $('#editor.' + key);
      if (option) {
        if (option.type === 'checkbox') {
          option = (option.labels || [])[0] || option.nextElementSibling || option;
        }
        progress = document.body.appendChild(
          $create('.set-option-progress', {targetElement: option}));
      }
    }
    if (progress) {
      const optionBounds = progress.targetElement.getBoundingClientRect();
      const bounds = {
        top: optionBounds.top + window.scrollY + 1,
        left: optionBounds.left + window.scrollX + 1,
        width: (optionBounds.width - 2) * index / total | 0,
        height: optionBounds.height - 2,
      };
      const style = progress.style;
      for (const prop in bounds) {
        if (bounds[prop] !== parseFloat(style[prop])) {
          style[prop] = bounds[prop] + 'px';
        }
      }
    }
    setTimeout(throttleSetOption, 0, {
      key,
      value,
      index,
      timeStart,
      cmStart,
      editorsCopy,
      progress,
    });
  }

  function getSection() {
    return this.display.wrapper.parentNode;
  }

  function nextEditor(cm) {
    return editor.nextEditor(cm);
  }

  function prevEditor(cm) {
    return editor.prevEditor(cm);
  }

  function jumpToLine(cm) {
    const cur = cm.getCursor();
    refocusMinidialog(cm);
    cm.openDialog(template.jumpToLine.cloneNode(true), str => {
      const m = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/);
      if (m) {
        cm.setCursor(m[1] - 1, m[2] ? m[2] - 1 : cur.ch);
      }
    }, {value: cur.line + 1});
  }

  function commentSelection(cm) {
    cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), {fullLines: false});
  }

  function toggleEditorFocus(cm) {
    if (!cm) return;
    if (cm.hasFocus()) {
      setTimeout(() => cm.display.input.blur());
    } else {
      cm.focus();
    }
  }

  function refocusMinidialog(cm) {
    const section = cm.getSection();
    if (!$('.CodeMirror-dialog', section)) {
      return;
    }
    // close the currently opened minidialog
    cm.focus();
    // make sure to focus the input in newly opened minidialog
    setTimeout(() => {
      $('.CodeMirror-dialog', section).focus();
    });
  }

  function onPrefChanged(key, value) {
    let option = key.replace(/^editor\./, '');
    if (!option) {
      console.error('no "cm_option"', key);
      return;
    }
    switch (option) {
      case 'tabSize':
        value = Number(value);
        CodeMirror.setOption('indentUnit', value);
        break;

      case 'indentWithTabs':
        CodeMirror.commands.insertTab = value ?
          ORIGINAL_COMMANDS.insertTab :
          CodeMirror.commands.insertSoftTab;
        break;

      case 'theme': {
        const themeLink = $('#cm-theme');
        // use non-localized 'default' internally
        if (!value || value === 'default' || value === t('defaultTheme')) {
          value = 'default';
          if (prefs.get(key) !== value) {
            prefs.set(key, value);
          }
          themeLink.href = '';
          $('#editor.theme').value = value;
          break;
        }
        const url = chrome.runtime.getURL('vendor/codemirror/theme/' + value + '.css');
        if (themeLink.href === url) {
          // preloaded in initCodeMirror()
          break;
        }
        // avoid flicker: wait for the second stylesheet to load, then apply the theme
        document.head.appendChild($create('link#cm-theme2', {rel: 'stylesheet', href: url}));
        setTimeout(() => {
          CodeMirror.setOption(option, value);
          themeLink.remove();
          $('#cm-theme2').id = 'cm-theme';
        }, 100);
        return;
      }

      case 'autocompleteOnTyping':
        if (editor) {
          // FIXME: this won't work with removed sections
          editor.getEditors().forEach(cm => setupAutocomplete(cm, value));
        }
        return;

      case 'autoCloseBrackets':
        Promise.resolve(value && loadScript('/vendor/codemirror/addon/edit/closebrackets.js')).then(() => {
          CodeMirror.setOption(option, value);
        });
        return;

      case 'matchHighlight':
        switch (value) {
          case 'token':
          case 'selection':
            document.body.dataset[option] = value;
            value = {showToken: value === 'token' && /[#.\-\w]/, annotateScrollbar: true};
            break;
          default:
            value = null;
        }
        option = 'highlightSelectionMatches';
        break;

      case 'colorpicker':
        return;
    }
    CodeMirror.setOption(option, value);
  }

  ////////////////////////////////////////////////

  function rerouteHotkeys(enable, immediately) {
    if (!immediately) {
      debounce(rerouteHotkeys, 0, enable, true);
    } else if (enable) {
      document.addEventListener('keydown', rerouteHandler);
    } else {
      document.removeEventListener('keydown', rerouteHandler);
    }
  }

  function rerouteHandler(event) {
    const keyName = CodeMirror.keyName(event);
    if (!keyName) {
      return;
    }
    const rerouteCommand = name => {
      if (REROUTED.has(name)) {
        CodeMirror.commands[name](editor.closestVisible(event.target));
        return true;
      }
    };
    if (CodeMirror.lookupKey(keyName, CodeMirror.defaults.keyMap, rerouteCommand) === 'handled' ||
        CodeMirror.lookupKey(keyName, CodeMirror.defaults.extraKeys, rerouteCommand) === 'handled') {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  ////////////////////////////////////////////////

  ////////////////////////////////////////////////

  function setupAutocomplete(cm, enable = true) {
    const onOff = enable ? 'on' : 'off';
    cm[onOff]('changes', autocompleteOnTyping);
    cm[onOff]('pick', autocompletePicked);
  }

  function autocompleteOnTyping(cm, [info], debounced) {
    if (
      cm.state.completionActive ||
      info.origin && !info.origin.includes('input') ||
      !info.text.last
    ) {
      return;
    }
    if (cm.state.autocompletePicked) {
      cm.state.autocompletePicked = false;
      return;
    }
    if (!debounced) {
      debounce(autocompleteOnTyping, 100, cm, [info], true);
      return;
    }
    if (info.text.last.match(/[-a-z!]+$/i)) {
      cm.state.autocompletePicked = false;
      cm.options.hintOptions.completeSingle = false;
      cm.execCommand('autocomplete');
      setTimeout(() => {
        cm.options.hintOptions.completeSingle = true;
      });
    }
  }

  function autocompletePicked(cm) {
    cm.state.autocompletePicked = true;
  }

  function save() {
    editor.save();
  }

  function toggleStyle() {
    editor.toggleStyle();
  }
});
