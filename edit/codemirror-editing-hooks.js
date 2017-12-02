/*
global CodeMirror linterConfig loadScript
global editors editor styleId
global save toggleStyle setupAutocomplete makeSectionVisible getSectionForChild
*/
'use strict';

onDOMready().then(() => {
  CodeMirror.defaults.lint = linterConfig.getForCodeMirror();

  const COMMANDS = {
    save,
    toggleStyle,
    jumpToLine,
    nextEditor, prevEditor,
    find, findNext, findPrev, replace, replaceAll,
  };
  // reroute handling to nearest editor when keypress resolves to one of these commands
  const REROUTED = new Set([
    ...Object.keys(COMMANDS),
    'colorpicker',
  ]);

  const ORIGINAL_COMMAND = {
    find: CodeMirror.commands.find,
    findNext: CodeMirror.commands.findNext,
    findPrev: CodeMirror.commands.findPrev,
    replace: CodeMirror.commands.replace
  };
  const ORIGINAL_METHOD = {
    openDialog: CodeMirror.prototype.openDialog,
    openConfirm: CodeMirror.prototype.openConfirm,
  };

  Object.assign(CodeMirror, {
    getOption,
    setOption,
  });
  Object.assign(CodeMirror.commands,
    COMMANDS);
  Object.assign(CodeMirror.prototype, {
    getSection,
    rerouteHotkeys,
  });

  // cm.state.search for last used 'find'
  let searchState;

  buildOptionsElements();
  setupLivePrefs();
  rerouteHotkeys(true);
  $('#options').addEventListener('change', onOptionElementChanged);

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
        progress = document.body.appendChild($element({
          className: 'set-option-progress',
          targetElement: option,
        }));
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
    nextPrevEditor(cm, 1);
  }

  function prevEditor(cm) {
    nextPrevEditor(cm, -1);
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
    //console.log('acmeEventListener heard %s on %s', event.type, el.id);
    if (!option) {
      console.error('acmeEventListener: no "cm_option" %O', el);
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
        document.head.appendChild($element({
          tag: 'link',
          id: 'cm-theme2',
          rel: 'stylesheet',
          href: url
        }));
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

  function buildOptionsElements() {
    // no need to escape the period in the id
    const themeControl = $('#editor.theme');
    const themeList = localStorage.codeMirrorThemes;
    if (themeList) {
      optionsFromArray(themeControl, themeList.split(/\s+/));
    } else {
      // Chrome is starting up and shows our edit.html, but the background page isn't loaded yet
      const theme = prefs.get('editor.theme');
      optionsFromArray(themeControl, [theme === 'default' ? t('defaultTheme') : theme]);
      getCodeMirrorThemes().then(() => {
        const themes = (localStorage.codeMirrorThemes || '').split(/\s+/);
        optionsFromArray(themeControl, themes);
        themeControl.selectedIndex = Math.max(0, themes.indexOf(theme));
      });
    }
    optionsFromArray($('#editor.keyMap'), Object.keys(CodeMirror.keyMap).sort());
  }

  function optionsFromArray(parent, options) {
    const fragment = document.createDocumentFragment();
    for (const opt of options) {
      fragment.appendChild($element({tag: 'option', textContent: opt}));
    }
    parent.appendChild(fragment);
  }

  /////////////////////

  function shouldIgnoreCase(query) {
    // treat all-lowercase non-regexp queries as case-insensitive
    return typeof query === 'string' && query === query.toLowerCase();
  }

  function updateState(cm, newState) {
    if (!newState) {
      if (cm.state.search) {
        return cm.state.search;
      }
      if (!searchState) {
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

  function find(activeCM) {
    activeCM = focusClosestCM(activeCM);
    customizeOpenDialog(activeCM, template.find, function (query) {
      this(query);
      searchState = activeCM.state.search;
      if (editors.length === 1 || !searchState.query) {
        return;
      }
      editors.forEach(cm => {
        if (cm !== activeCM) {
          cm.execCommand('clearSearch');
          updateState(cm, searchState);
        }
      });
      if (CodeMirror.cmpPos(searchState.posFrom, searchState.posTo) === 0) {
        findNext(activeCM);
      }
    });
    ORIGINAL_COMMAND.find(activeCM);
  }

  function findNext(activeCM, reverse) {
    let state = updateState(activeCM);
    if (!state || !state.query) {
      find(activeCM);
      return;
    }
    let pos = activeCM.getCursor(reverse ? 'from' : 'to');
    // clear the selection, don't move the cursor
    activeCM.setSelection(activeCM.getCursor());

    const rxQuery = typeof state.query === 'object'
      ? state.query : stringAsRegExp(state.query, shouldIgnoreCase(state.query) ? 'i' : '');

    if (
      document.activeElement &&
      document.activeElement.name === 'applies-value' &&
      searchAppliesTo(activeCM)
    ) {
      return;
    }
    let cm = activeCM;
    for (let i = 0; i < editors.length; i++) {
      state = updateState(cm);
      if (!cm.hasFocus()) {
        pos = reverse ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(0, 0);
      }
      const searchCursor = cm.getSearchCursor(state.query, pos, shouldIgnoreCase(state.query));
      if (searchCursor.find(reverse)) {
        if (editors.length > 1) {
          makeSectionVisible(cm);
          cm.focus();
        }
        // speedup the original findNext
        state.posFrom = reverse ? searchCursor.to() : searchCursor.from();
        state.posTo = CodeMirror.Pos(state.posFrom.line, state.posFrom.ch);
        ORIGINAL_COMMAND[reverse ? 'findPrev' : 'findNext'](cm);
        return;
      } else if (!reverse && searchAppliesTo(cm)) {
        return;
      }
      cm = editors[(editors.indexOf(cm) + (reverse ? -1 + editors.length : 1)) % editors.length];
      if (reverse && searchAppliesTo(cm)) {
        return;
      }
    }
    // nothing found so far, so call the original search with wrap-around
    ORIGINAL_COMMAND[reverse ? 'findPrev' : 'findNext'](activeCM);

    function searchAppliesTo(cm) {
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
});
