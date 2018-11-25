/* global CodeMirror loadScript rerouteHotkeys prefs $ debounce $create */
/* exported cmFactory */
'use strict';
/*
All cm instances created by this module are collected so we can broadcast prefs
settings to them. You should `cmFactory.destroy(cm)` to unregister the listener
when the instance is not used anymore.
*/
const cmFactory = (() => {
  const editors = new Set();
  // used by `indentWithTabs` option
  const INSERT_TAB_COMMAND = CodeMirror.commands.insertTab;
  const INSERT_SOFT_TAB_COMMAND = CodeMirror.commands.insertSoftTab;

  CodeMirror.defineOption('tabSize', prefs.get('editor.tabSize'), (cm, value) => {
    cm.setOption('indentUnit', Number(value));
  });

  CodeMirror.defineOption('indentWithTabs', prefs.get('editor.indentWithTabs'), (cm, value) => {
    CodeMirror.commands.insertTab = value ?
      INSERT_TAB_COMMAND :
      INSERT_SOFT_TAB_COMMAND;
  });

  CodeMirror.defineOption('autocompleteOnTyping', prefs.get('editor.autocompleteOnTyping'), (cm, value) => {
    const onOff = value ? 'on' : 'off';
    cm[onOff]('changes', autocompleteOnTyping);
    cm[onOff]('pick', autocompletePicked);
  });

  CodeMirror.defineOption('matchHighlight', prefs.get('editor.matchHighlight'), (cm, value) => {
    if (value === 'token') {
      cm.setOption('highlightSelectionMatches', {
        showToken: /[#.\-\w]/,
        annotateScrollbar: true,
        onUpdate: updateMatchHighlightCount
      });
    } else if (value === 'selection') {
      cm.setOption('highlightSelectionMatches', {
        showToken: false,
        annotateScrollbar: true,
        onUpdate: updateMatchHighlightCount
      });
    } else {
      cm.setOption('highlightSelectionMatches', null);
    }
  });

  CodeMirror.defineOption('selectByTokens', prefs.get('editor.selectByTokens'), (cm, value) => {
    cm.setOption('configureMouse', value ? configureMouseFn : null);
  });

  prefs.subscribe(null, (key, value) => {
    const option = key.replace(/^editor\./, '');
    if (!option) {
      console.error('no "cm_option"', key);
      return;
    }
    // FIXME: this is implemented in `colorpicker-helper.js`.
    if (option === 'colorpicker') {
      return;
    }
    if (option === 'theme') {
      const themeLink = $('#cm-theme');
      // use non-localized 'default' internally
      if (value === 'default') {
        themeLink.href = '';
      } else {
        const url = chrome.runtime.getURL('vendor/codemirror/theme/' + value + '.css');
        if (themeLink.href !== url) {
          // avoid flicker: wait for the second stylesheet to load, then apply the theme
          return loadScript(url, true).then(([newThemeLink]) => {
            setOption(option, value);
            themeLink.remove();
            newThemeLink.id = 'cm-theme';
          });
        }
      }
    }
    // broadcast option
    setOption(option, value);
  });
  return {create, destroy, setOption};

  function updateMatchHighlightCount(cm, state) {
    cm.display.wrapper.dataset.matchHighlightCount = state.matchesonscroll.matches.length;
  }

  function configureMouseFn(cm, repeat) {
    return repeat === 'double' ?
      {unit: selectTokenOnDoubleclick} :
      {};
  }

  function selectTokenOnDoubleclick(cm, pos) {
    let {ch} = pos;
    const {line, sticky} = pos;
    const {text, styles} = cm.getLineHandle(line);

    const execAt = (rx, i) => (rx.lastIndex = i) && null || rx.exec(text);
    const at = (rx, i) => (rx.lastIndex = i) && null || rx.test(text);
    const atWord = ch => at(/\w/y, ch);
    const atSpace = ch => at(/\s/y, ch);

    const atTokenEnd = styles.indexOf(ch, 1);
    ch += atTokenEnd < 0 ? 0 : sticky === 'before' && atWord(ch - 1) ? 0 : atSpace(ch + 1) ? 0 : 1;
    ch = Math.min(text.length, ch);
    const type = cm.getTokenTypeAt({line, ch: ch + (sticky === 'after' ? 1 : 0)});
    if (atTokenEnd > 0) ch--;

    const isCss = type && !/^(comment|string)/.test(type);
    const isNumber = type === 'number';
    const isSpace = atSpace(ch);
    let wordChars =
      isNumber ? /[-+\w.%]/y :
      isCss ? /[-\w@]/y :
      isSpace ? /\s/y :
      atWord(ch) ? /\w/y : /[^\w\s]/y;

    let a = ch;
    while (a && at(wordChars, a)) a--;
    a += !a && at(wordChars, a) || isCss && at(/[.!#@]/y, a) ? 0 : at(wordChars, a + 1);

    let b, found;

    if (isNumber) {
      b = a + execAt(/[+-]?[\d.]+(e\d+)?|$/yi, a)[0].length;
      found = b >= ch;
      if (!found) {
        a = b;
        ch = a;
      }
    }

    if (!found) {
      wordChars = isCss ? /[-\w]*/y : new RegExp(wordChars.source + '*', 'uy');
      b = ch + execAt(wordChars, ch)[0].length;
    }

    return {
      from: {line, ch: a},
      to: {line, ch: b},
    };
  }

  function autocompleteOnTyping(cm, [info], debounced) {
    const lastLine = info.text[info.text.length - 1];
    if (
      cm.state.completionActive ||
      info.origin && !info.origin.includes('input') ||
      !lastLine
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
    if (lastLine.match(/[-a-z!]+$/i)) {
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

  function destroy(cm) {
    editors.delete(cm);
  }

  function create(init, options) {
    const cm = CodeMirror(init, options);
    cm.lastActive = 0;
    const wrapper = cm.display.wrapper;
    cm.on('blur', () => {
      rerouteHotkeys(true);
      setTimeout(() => {
        wrapper.classList.toggle('CodeMirror-active', wrapper.contains(document.activeElement));
      });
    });
    cm.on('focus', () => {
      rerouteHotkeys(false);
      wrapper.classList.add('CodeMirror-active');
      cm.lastActive = Date.now();
    });
    editors.add(cm);
    return cm;
  }

  function getLastActivated() {
    let result;
    for (const cm of editors) {
      if (!result || result.lastActive < cm.lastActive) {
        result = cm;
      }
    }
    return result;
  }

  function setOption(key, value) {
    CodeMirror.defaults[key] = value;
    if (editors.size > 4 && (key === 'theme' || key === 'lineWrapping')) {
      throttleSetOption({key, value, index: 0});
      return;
    }
    for (const cm of editors) {
      cm.setOption(key, value);
    }
  }

  function throttleSetOption({
    key,
    value,
    index,
    timeStart = performance.now(),
    editorsCopy = [...editors],
    cmStart = getLastActivated(),
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
    while (index < total) {
      const cm = editorsCopy[index++];
      if (cm === cmStart || !editors.has(cm)) {
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
})();
