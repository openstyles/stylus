/*
global CodeMirror loadScript
global editors editor styleId ownTabId
global save toggleStyle setupAutocomplete makeSectionVisible getSectionForChild
global getSectionsHashes
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
  Object.assign(CodeMirror, {
    getOption,
    setOption,
    closestVisible,
  });
  Object.assign(CodeMirror.prototype, {
    getSection,
    rerouteHotkeys,
  });

  CodeMirror.defineInitHook(cm => {
    if (!cm.display.wrapper.closest('#sections')) {
      return;
    }
    if (prefs.get('editor.livePreview') && styleId) {
      cm.on('changes', updatePreview);
    }
    if (prefs.get('editor.autocompleteOnTyping')) {
      setupAutocomplete(cm);
    }
    const wrapper = cm.display.wrapper;
    cm.on('blur', () => {
      editors.lastActive = cm;
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

  new MutationObserver((mutations, observer) => {
    if (!$('#sections')) {
      return;
    }
    observer.disconnect();

    prefs.subscribe(['editor.keyMap'], showHotkeyInTooltip);
    addEventListener('showHotkeyInTooltip', showHotkeyInTooltip);
    showHotkeyInTooltip();

    // N.B. the onchange event listeners should be registered before setupLivePrefs()
    $('#options').addEventListener('change', onOptionElementChanged);
    setupLivePreview();
    buildThemeElement();
    buildKeymapElement();
    setupLivePrefs();

    Object.assign(CodeMirror.commands, COMMANDS);
    rerouteHotkeys(true);
  }).observe(document, {childList: true, subtree: true});

  return;

  ////////////////////////////////////////////////

  function getOption(o) {
    return CodeMirror.defaults[o];
  }

  function setOption(o, v) {
    CodeMirror.defaults[o] = v;
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
    cmStart = editors.lastActive || editors[0],
    editorsCopy = editors.slice(),
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
    return nextPrevEditor(cm, 1);
  }

  function prevEditor(cm) {
    return nextPrevEditor(cm, -1);
  }

  function nextPrevEditor(cm, direction) {
    cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
    makeSectionVisible(cm);
    cm.focus();
    return cm;
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

  function onOptionElementChanged(event) {
    const el = event.target;
    let option = el.id.replace(/^editor\./, '');
    if (!option) {
      console.error('no "cm_option"', el);
      return;
    }
    let value = el.type === 'checkbox' ? el.checked : el.value;
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
          if (prefs.get(el.id) !== value) {
            prefs.set(el.id, value);
          }
          themeLink.href = '';
          el.selectedIndex = 0;
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
        editors.forEach(cm => setupAutocomplete(cm, el.checked));
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

  function buildThemeElement() {
    const themeElement = $('#editor.theme');
    const themeList = localStorage.codeMirrorThemes;

    const optionsFromArray = options => {
      const fragment = document.createDocumentFragment();
      options.forEach(opt => fragment.appendChild($create('option', opt)));
      themeElement.appendChild(fragment);
    };

    if (themeList) {
      optionsFromArray(themeList.split(/\s+/));
    } else {
      // Chrome is starting up and shows our edit.html, but the background page isn't loaded yet
      const theme = prefs.get('editor.theme');
      optionsFromArray([theme === 'default' ? t('defaultTheme') : theme]);
      getCodeMirrorThemes().then(() => {
        const themes = (localStorage.codeMirrorThemes || '').split(/\s+/);
        optionsFromArray(themes);
        themeElement.selectedIndex = Math.max(0, themes.indexOf(theme));
      });
    }
  }

  function buildKeymapElement() {
    // move 'pc' or 'mac' prefix to the end of the displayed label
    const maps = Object.keys(CodeMirror.keyMap)
      .map(name => ({
        value: name,
        name: name.replace(/^(pc|mac)(.+)/, (s, arch, baseName) =>
          baseName.toLowerCase() + '-' + (arch === 'mac' ? 'Mac' : 'PC')),
      }))
      .sort((a, b) => a.name < b.name && -1 || a.name > b.name && 1);

    const fragment = document.createDocumentFragment();
    let bin = fragment;
    let groupName;
    // group suffixed maps in <optgroup>
    maps.forEach(({value, name}, i) => {
      groupName = !name.includes('-') ? name : groupName;
      const groupWithNext = maps[i + 1] && maps[i + 1].name.startsWith(groupName);
      if (groupWithNext) {
        if (bin === fragment) {
          bin = fragment.appendChild($create('optgroup', {label: name.split('-')[0]}));
        }
      }
      const el = bin.appendChild($create('option', {value}, name));
      if (value === prefs.defaults['editor.keyMap']) {
        el.dataset.default = '';
        el.title = t('defaultTheme');
      }
      if (!groupWithNext) bin = fragment;
    });
    $('#editor.keyMap').appendChild(fragment);
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
        CodeMirror.commands[name](closestVisible(event.target));
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

  // priority:
  // 1. associated CM for applies-to element
  // 2. last active if visible
  // 3. first visible
  function closestVisible(nearbyElement) {
    const cm =
      nearbyElement instanceof CodeMirror ? nearbyElement :
      nearbyElement instanceof Node && (getSectionForChild(nearbyElement) || {}).CodeMirror ||
      editors.lastActive;
    if (nearbyElement instanceof Node && cm) {
      const {left, top} = nearbyElement.getBoundingClientRect();
      const bounds = cm.display.wrapper.getBoundingClientRect();
      if (top >= 0 && top >= bounds.top &&
          left >= 0 && left >= bounds.left) {
        return cm;
      }
    }
    // closest editor should have at least 2 lines visible
    const lineHeight = editors[0].defaultTextHeight();
    const scrollY = window.scrollY;
    const windowBottom = scrollY + window.innerHeight - 2 * lineHeight;
    const allSectionsContainerTop = scrollY + $('#sections').getBoundingClientRect().top;
    const distances = [];
    const alreadyInView = cm && offscreenDistance(null, cm) === 0;
    return alreadyInView ? cm : findClosest();

    function offscreenDistance(index, cm) {
      if (index >= 0 && distances[index] !== undefined) {
        return distances[index];
      }
      const section = (cm || editors[index]).getSection();
      if (!section) {
        return 1e9;
      }
      const top = allSectionsContainerTop + section.offsetTop;
      if (top < scrollY + lineHeight) {
        return Math.max(0, scrollY - top - lineHeight);
      }
      if (top < windowBottom) {
        return 0;
      }
      const distance = top - windowBottom + section.offsetHeight;
      if (index >= 0) {
        distances[index] = distance;
      }
      return distance;
    }

    function findClosest() {
      const last = editors.length - 1;
      let a = 0;
      let b = last;
      let c;
      let distance;
      while (a < b - 1) {
        c = (a + b) / 2 | 0;
        distance = offscreenDistance(c);
        if (!distance || !c) {
          break;
        }
        const distancePrev = offscreenDistance(c - 1);
        const distanceNext = c < last ? offscreenDistance(c + 1) : 1e20;
        if (distancePrev <= distance && distance <= distanceNext) {
          b = c;
        } else {
          a = c;
        }
      }
      while (b && offscreenDistance(b - 1) <= offscreenDistance(b)) {
        b--;
      }
      const cm = editors[b];
      if (distances[b] > 0) {
        makeSectionVisible(cm);
      }
      return cm;
    }
  }

  ////////////////////////////////////////////////

  function getCodeMirrorThemes() {
    if (!chrome.runtime.getPackageDirectoryEntry) {
      const themes = [
        chrome.i18n.getMessage('defaultTheme'),
        /* populate-theme-start */
        '3024-day',
        '3024-night',
        'abcdef',
        'ambiance',
        'ambiance-mobile',
        'base16-dark',
        'base16-light',
        'bespin',
        'blackboard',
        'cobalt',
        'colorforth',
        'darcula',
        'dracula',
        'duotone-dark',
        'duotone-light',
        'eclipse',
        'elegant',
        'erlang-dark',
        'gruvbox-dark',
        'hopscotch',
        'icecoder',
        'idea',
        'isotope',
        'lesser-dark',
        'liquibyte',
        'lucario',
        'material',
        'mbo',
        'mdn-like',
        'midnight',
        'monokai',
        'neat',
        'neo',
        'night',
        'oceanic-next',
        'panda-syntax',
        'paraiso-dark',
        'paraiso-light',
        'pastel-on-dark',
        'railscasts',
        'rubyblue',
        'seti',
        'shadowfox',
        'solarized',
        'ssms',
        'the-matrix',
        'tomorrow-night-bright',
        'tomorrow-night-eighties',
        'ttcn',
        'twilight',
        'vibrant-ink',
        'xq-dark',
        'xq-light',
        'yeti',
        'zenburn',
        /* populate-theme-end */
      ];
      localStorage.codeMirrorThemes = themes.join(' ');
      return Promise.resolve(themes);
    }
    return new Promise(resolve => {
      chrome.runtime.getPackageDirectoryEntry(rootDir => {
        rootDir.getDirectory('vendor/codemirror/theme', {create: false}, themeDir => {
          themeDir.createReader().readEntries(entries => {
            const themes = [
              chrome.i18n.getMessage('defaultTheme')
            ].concat(
              entries.filter(entry => entry.isFile)
                .sort((a, b) => (a.name < b.name ? -1 : 1))
                .map(entry => entry.name.replace(/\.css$/, ''))
            );
            localStorage.codeMirrorThemes = themes.join(' ');
            resolve(themes);
          });
        });
      });
    });
  }

  function showHotkeyInTooltip(_, mapName = prefs.get('editor.keyMap')) {
    const extraKeys = CodeMirror.defaults.extraKeys;
    for (const el of $$('[data-hotkey-tooltip]')) {
      if (el._hotkeyTooltipKeyMap !== mapName) {
        el._hotkeyTooltipKeyMap = mapName;
        const title = el._hotkeyTooltipTitle = el._hotkeyTooltipTitle || el.title;
        const cmd = el.dataset.hotkeyTooltip;
        const key = cmd[0] === '=' ? cmd.slice(1) :
          findKeyForCommand(cmd, mapName) ||
          extraKeys && findKeyForCommand(cmd, extraKeys);
        const newTitle = title + (title && key ? '\n' : '') + (key || '');
        if (el.title !== newTitle) el.title = newTitle;
      }
    }
  }

  function findKeyForCommand(command, map) {
    if (typeof map === 'string') map = CodeMirror.keyMap[map];
    let key = Object.keys(map).find(k => map[k] === command);
    if (key) {
      return key;
    }
    for (const ft of Array.isArray(map.fallthrough) ? map.fallthrough : [map.fallthrough]) {
      key = ft && findKeyForCommand(command, ft);
      if (key) {
        return key;
      }
    }
    return '';
  }

  function setupLivePreview() {
    if (!prefs.get('editor.livePreview') && !editors.length) {
      setTimeout(setupLivePreview);
      return;
    }
    if (styleId) {
      $('#editor.livePreview').onchange = livePreviewToggled;
      return;
    }
    // wait for #preview-label's class to lose 'hidden' after the first save
    new MutationObserver((_, observer) => {
      if (!styleId) return;
      observer.disconnect();
      setupLivePreview();
      livePreviewToggled();
    }).observe($('#preview-label'), {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function livePreviewToggled() {
    const me = this instanceof Node ? this : $('#editor.livePreview');
    const previewing = me.checked;
    editors.forEach(cm => cm[previewing ? 'on' : 'off']('changes', updatePreview));
    const addRemove = EventTarget.prototype[previewing ? 'addEventListener' : 'removeEventListener'];
    addRemove.call($('#enabled'), 'change', updatePreview);
    if (!editor) {
      for (const el of $$('#sections .applies-to')) {
        addRemove.call(el, 'input', updatePreview);
      }
      toggleLivePreviewSectionsObserver(previewing);
    }
    if (!previewing || document.body.classList.contains('dirty')) {
      updatePreview(null, previewing);
    }
  }

  /**
   * Observes newly added section elements, and sets these event listeners:
   *   1. 'changes' on CodeMirror inside
   *   2. 'input' on .applies-to inside
   * The goal is to avoid listening to 'input' on the entire #sections tree,
   * which would trigger updatePreview() twice on any keystroke -
   * both for the synthetic event from CodeMirror and the original event.
   * Side effects:
   *   two expando properties on #sections
   *   1. __livePreviewObserver
   *   2. __livePreviewObserverEnabled
   * @param {Boolean} enable
   */
  function toggleLivePreviewSectionsObserver(enable) {
    const sections = $('#sections');
    const observing = sections.__livePreviewObserverEnabled;
    let mo = sections.__livePreviewObserver;
    if (enable && !mo) {
      sections.__livePreviewObserver = mo = new MutationObserver(mutations => {
        for (const {addedNodes} of mutations) {
          for (const node of addedNodes) {
            const el = node.children && $('.applies-to', node);
            if (el) el.addEventListener('input', updatePreview);
            if (node.CodeMirror) node.CodeMirror.on('changes', updatePreview);
          }
        }
      });
    }
    if (enable && !observing) {
      mo.observe(sections, {childList: true});
      sections.__livePreviewObserverEnabled = true;
    } else if (!enable && observing) {
      mo.disconnect();
      sections.__livePreviewObserverEnabled = false;
    }
  }

  function updatePreview(data, previewing) {
    if (previewing !== true && previewing !== false) {
      if (data instanceof Event && !data.target.matches('.style-contributor')) return;
      debounce(updatePreview, data && data.id === 'enabled' ? 0 : 400, null, true);
      return;
    }
    const errors = $('#preview-errors');
    API.refreshAllTabs({
      reason: 'editPreview',
      tabId: ownTabId,
      style: {
        id: styleId,
        enabled: $('#enabled').checked,
        sections: previewing && (editor ? editors[0].getValue() : getSectionsHashes()),
      },
    }).then(() => {
      errors.classList.add('hidden');
    }).catch(err => {
      if (Array.isArray(err)) err = err.join('\n');
      if (err && editor && !isNaN(err.index)) {
        const pos = editors[0].posFromIndex(err.index);
        err = `${pos.line}:${pos.ch} ${err}`;
      }
      errors.classList.remove('hidden');
      errors.onclick = () => messageBox.alert(String(err), 'pre');
    });
  }
});
