/*
global CodeMirror linterConfig loadScript
global editors editor styleId
global save toggleStyle setupAutocomplete makeSectionVisible getSectionForChild
*/
'use strict';

onDOMscriptReady('/codemirror.js').then(() => {

  CodeMirror.defaults.lint = linterConfig.getForCodeMirror();

  const COMMANDS = {
    save,
    toggleStyle,
    jumpToLine,
    defocusEditor,
    nextEditor, prevEditor,
    find, findNext, findPrev, replace, replaceAll,
  };
  // reroute handling to nearest editor when keypress resolves to one of these commands
  const REROUTED = new Set([
    ...Object.keys(COMMANDS),
    'colorpicker',
  ]);
  const ORIGINAL_COMMAND = {};
  const ORIGINAL_METHOD = {};
  Object.assign(CodeMirror, {
    getOption,
    setOption,
  });
  Object.assign(CodeMirror.prototype, {
    getSection,
    rerouteHotkeys,
  });

  // cm.state.search for last used 'find'
  let searchState;

  new MutationObserver((mutations, observer) => {
    if (!$('#sections')) {
      return;
    }
    observer.disconnect();

    prefs.subscribe(['editor.keyMap'], showKeyInSaveButtonTooltip);
    showKeyInSaveButtonTooltip();

    // N.B. the event listener should be registered before setupLivePrefs()
    $('#options').addEventListener('change', onOptionElementChanged);
    buildThemeElement();
    buildKeymapElement();
    setupLivePrefs();

    rerouteHotkeys(true);
    setupFindHooks();
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

  function defocusEditor(cm) {
    cm.display.input.blur();
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

    const optionsFromArray = (options) => {
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
      !groupWithNext && (bin = fragment);
    });
    $('#editor.keyMap').appendChild(fragment);
  }

  /////////////////////

  function setupFindHooks() {
    for (const name of ['find', 'findNext', 'findPrev', 'replace']) {
      ORIGINAL_COMMAND[name] = CodeMirror.commands[name];
    }
    for (const name of ['openDialog', 'openConfirm']) {
      ORIGINAL_METHOD[name] = CodeMirror.prototype[name];
    }
    Object.assign(CodeMirror.commands, COMMANDS);
    chrome.storage.local.get('editSearchText', data => {
      searchState = {query: data.editSearchText || null};
    });
  }

  function shouldIgnoreCase(query) {
    // treat all-lowercase non-regexp queries as case-insensitive
    return typeof query === 'string' && query === query.toLowerCase();
  }

  function updateState(cm, newState) {
    if (!newState) {
      if ((cm.state.search || {}).overlay) {
        return cm.state.search;
      }
      if (!searchState.overlay) {
        return null;
      }
      newState = searchState;
    }
    cm.state.search = {
      query: newState.query,
      overlay: newState.overlay,
      annotate: cm.showMatchesOnScrollbar(newState.query, shouldIgnoreCase(newState.query))
    };
    cm.addOverlay(newState.overlay);
    return cm.state.search;
  }

  // overrides the original openDialog with a clone of the provided template
  function customizeOpenDialog(cm, template, callback) {
    cm.openDialog = (tmpl, cb, opt) => {
      // invoke 'callback' and bind 'this' to the original callback
      ORIGINAL_METHOD.openDialog.call(cm, template.cloneNode(true), callback.bind(cb), opt);
    };
    setTimeout(() => (cm.openDialog = ORIGINAL_METHOD.openDialog));
    refocusMinidialog(cm);
  }

  function focusClosestCM(activeCM) {
    editors.lastActive = activeCM;
    const cm = getEditorInSight();
    if (cm !== activeCM) {
      cm.focus();
    }
    return cm;
  }

  function propagateSearchState(cm) {
    if ((cm.state.search || {}).clearSearch) {
      cm.execCommand('clearSearch');
    }
    updateState(cm);
  }

  function find(activeCM) {
    activeCM = focusClosestCM(activeCM);
    const state = activeCM.state;
    if (searchState.query && !(state.search || {}).lastQuery) {
      (state.search = state.search || {}).query = searchState.query;
    }
    customizeOpenDialog(activeCM, template.find, function (query) {
      this(query);
      searchState = state.search;
      if (searchState.query) {
        chrome.storage.local.set({editSearchText: searchState.query});
      }
      if (!searchState.query ||
          editors.length === 1 ||
          CodeMirror.cmpPos(searchState.posFrom, searchState.posTo)) {
        return;
      }
      editors.forEach(cm => ((cm.state.search || {}).clearSearch = cm !== activeCM));
      editors.forEach((cm, i) => setTimeout(propagateSearchState, i + 100, cm));
      findNext(activeCM);
    });
    ORIGINAL_COMMAND.find(activeCM);
  }

  function findNext(activeCM, reverse) {
    let state = updateState(activeCM);
    if (!state || !state.overlay) {
      find(activeCM);
      return;
    }
    let pos = activeCM.getCursor(reverse ? 'from' : 'to');
    // clear the selection, don't move the cursor
    if (activeCM.somethingSelected()) {
      activeCM.setSelection(activeCM.getCursor());
    }

    const icase = shouldIgnoreCase(state.query);
    const query = searchState.query;
    const rxQuery = typeof query === 'object'
      ? query : stringAsRegExp(query, icase ? 'i' : '');

    const total = editors.length;
    if ((!reverse || total === 1 ||
        (document.activeElement || {}).name === 'applies-value') &&
        findAppliesTo(activeCM, reverse, rxQuery)) {
      return;
    }
    let cm = activeCM;
    const startIndex = editors.indexOf(cm);
    for (let i = 1; i < total; i++) {
      cm = editors[(startIndex + i * (reverse ? -1 : 1) + total) % total];
      pos = reverse ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(0, 0);
      const searchCursor = cm.getSearchCursor(query, pos, icase);
      if (searchCursor.find(reverse)) {
        if (total > 1) {
          makeSectionVisible(cm);
          cm.focus();
        }
        if ((cm.state.search || {}).clearSearch) {
          cm.execCommand('clearSearch');
        }
        state = updateState(cm);
        // speedup the original findNext
        state.posFrom = reverse ? searchCursor.to() : searchCursor.from();
        state.posTo = Object.assign({}, state.posFrom);
        setTimeout(ORIGINAL_COMMAND[reverse ? 'findPrev' : 'findNext'], 0, cm);
        return;
      } else if (!reverse && findAppliesTo(cm, reverse, rxQuery)) {
        return;
      }
      cm = editors[(startIndex + (i + 1) * (reverse ? -1 : 1) + total) % total];
      if (reverse && findAppliesTo(cm, reverse, rxQuery)) {
        return;
      }
    }
    // nothing found so far, so call the original search with wrap-around
    ORIGINAL_COMMAND[reverse ? 'findPrev' : 'findNext'](activeCM);
  }

  function findAppliesTo(cm, reverse, rxQuery) {
    let inputs = $$('.applies-value', cm.getSection());
    if (reverse) {
      inputs = inputs.reverse();
    }
    inputs.splice(0, inputs.indexOf(document.activeElement) + 1);
    return inputs.some(input => {
      const match = rxQuery.exec(input.value);
      if (match) {
        input.focus();
        const end = match.index + match[0].length;
        // scroll selected part into view in long inputs,
        // works only outside of current event handlers chain, hence timeout=0
        setTimeout(() => {
          input.setSelectionRange(end, end);
          input.setSelectionRange(match.index, end);
        }, 0);
        return true;
      }
    });
  }

  function findPrev(cm) {
    findNext(cm, true);
  }

  function replace(activeCM, all) {
    let queue;
    let query;
    let replacement;
    activeCM = focusClosestCM(activeCM);
    customizeOpenDialog(activeCM, template[all ? 'replaceAll' : 'replace'], function (txt) {
      query = txt;
      customizeOpenDialog(activeCM, template.replaceWith, txt => {
        replacement = txt;
        queue = editors.rotate(-editors.indexOf(activeCM));
        if (all) {
          editors.forEach(doReplace);
        } else {
          doReplace();
        }
      });
      this(query);
    });
    ORIGINAL_COMMAND.replace(activeCM, all);

    function doReplace() {
      const cm = queue.shift();
      if (!cm) {
        if (!all) {
          editors.lastActive.focus();
        }
        return;
      }
      // hide the first two dialogs (replace, replaceWith)
      cm.openDialog = (tmpl, callback) => {
        cm.openDialog = (tmpl, callback) => {
          cm.openDialog = ORIGINAL_METHOD.openDialog;
          if (all) {
            callback(replacement);
          } else {
            doConfirm(cm);
            callback(replacement);
            if (!$('.CodeMirror-dialog', cm.getWrapperElement())) {
              // no dialog == nothing found in the current CM, move to the next
              doReplace();
            }
          }
        };
        callback(query);
      };
      ORIGINAL_COMMAND.replace(cm, all);
    }
    function doConfirm(cm) {
      let wrapAround = false;
      const origPos = cm.getCursor();
      cm.openConfirm = function overrideConfirm(tmpl, callbacks, opt) {
        const ovrCallbacks = callbacks.map(callback => () => {
          makeSectionVisible(cm);
          cm.openConfirm = overrideConfirm;
          setTimeout(() => (cm.openConfirm = ORIGINAL_METHOD.openConfirm));

          const pos = cm.getCursor();
          callback();
          const cmp = CodeMirror.cmpPos(cm.getCursor(), pos);
          wrapAround |= cmp <= 0;

          const dlg = $('.CodeMirror-dialog', cm.getWrapperElement());
          if (!dlg || cmp === 0 || wrapAround && CodeMirror.cmpPos(cm.getCursor(), origPos) >= 0) {
            $.remove(dlg);
            doReplace();
          }
        });
        ORIGINAL_METHOD.openConfirm.call(cm, template.replaceConfirm.cloneNode(true), ovrCallbacks, opt);
      };
    }
  }

  function replaceAll(cm) {
    replace(cm, true);
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
        CodeMirror.commands[name](getEditorInSight(event.target));
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

  function getEditorInSight(nearbyElement) {
    // priority: 1. associated CM for applies-to element 2. last active if visible 3. first visible
    let cm;
    if (nearbyElement && nearbyElement.className.indexOf('applies-') >= 0) {
      cm = getSectionForChild(nearbyElement).CodeMirror;
    } else {
      cm = editors.lastActive;
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
        'dracula',
        'duotone-dark',
        'duotone-light',
        'eclipse',
        'elegant',
        'erlang-dark',
        'hopscotch',
        'icecoder',
        'isotope',
        'lesser-dark',
        'liquibyte',
        'material',
        'mbo',
        'mdn-like',
        'midnight',
        'monokai',
        'neat',
        'neo',
        'night',
        'panda-syntax',
        'paraiso-dark',
        'paraiso-light',
        'pastel-on-dark',
        'railscasts',
        'rubyblue',
        'seti',
        'solarized',
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

  function showKeyInSaveButtonTooltip(prefName, value) {
    $('#save-button').title = findKeyForCommand('save', value);
  }

  function findKeyForCommand(command, mapName = CodeMirror.defaults.keyMap) {
    const map = CodeMirror.keyMap[mapName];
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
});
