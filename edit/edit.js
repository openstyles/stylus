/* eslint brace-style: 0, operator-linebreak: 0 */
/* global CodeMirror parserlib */
/* global onDOMscripted */
/* global css_beautify */
/* global CSSLint initLint linterConfig updateLintReport renderLintReport updateLinter */
'use strict';

let styleId = null;
// only the actually dirty items here
let dirty = {};
// array of all CodeMirror instances
const editors = [];
let saveSizeOnClose;
// use browser history back when 'back to manage' is clicked
let useHistoryBack;

// direct & reverse mapping of @-moz-document keywords and internal property names
const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
const CssToProperty = {'url': 'urls', 'url-prefix': 'urlPrefixes', 'domain': 'domains', 'regexp': 'regexps'};

// if background page hasn't been loaded yet, increase the chances it has before DOMContentLoaded
onBackgroundReady();

// make querySelectorAll enumeration code readable
['forEach', 'some', 'indexOf', 'map'].forEach(method => {
  NodeList.prototype[method] = Array.prototype[method];
});

// Chrome pre-34
Element.prototype.matches = Element.prototype.matches || Element.prototype.webkitMatchesSelector;

// Chrome pre-41 polyfill
Element.prototype.closest = Element.prototype.closest || function (selector) {
  let e;
  // eslint-disable-next-line no-empty
  for (e = this; e && !e.matches(selector); e = e.parentElement) {}
  return e;
};

// eslint-disable-next-line no-extend-native
Array.prototype.rotate = function (amount) {
  // negative amount == rotate left
  const r = this.slice(-amount, this.length);
  Array.prototype.push.apply(r, this.slice(0, this.length - r.length));
  return r;
};

// eslint-disable-next-line no-extend-native
Object.defineProperty(Array.prototype, 'last', {get: function () { return this[this.length - 1]; }});

// preload the theme so that CodeMirror can calculate its metrics in DOMContentLoaded->setupLivePrefs()
new MutationObserver((mutations, observer) => {
  const themeElement = $('#cm-theme');
  if (themeElement) {
    themeElement.href = prefs.get('editor.theme') === 'default' ? ''
      : 'vendor/codemirror/theme/' + prefs.get('editor.theme') + '.css';
    observer.disconnect();
  }
}).observe(document, {subtree: true, childList: true});

getCodeMirrorThemes();

// reroute handling to nearest editor when keypress resolves to one of these commands
const hotkeyRerouter = {
  commands: {
    save: true, jumpToLine: true, nextEditor: true, prevEditor: true,
    find: true, findNext: true, findPrev: true, replace: true, replaceAll: true,
    toggleStyle: true,
  },
  setState: enable => {
    setTimeout(() => {
      document[(enable ? 'add' : 'remove') + 'EventListener']('keydown', hotkeyRerouter.eventHandler);
    }, 0);
  },
  eventHandler: event => {
    const keyName = CodeMirror.keyName(event);
    if (
      CodeMirror.lookupKey(keyName, CodeMirror.getOption('keyMap'), handleCommand) === 'handled' ||
      CodeMirror.lookupKey(keyName, CodeMirror.defaults.extraKeys, handleCommand) === 'handled'
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
    function handleCommand(command) {
      if (hotkeyRerouter.commands[command] === true) {
        CodeMirror.commands[command](getEditorInSight(event.target));
        return true;
      }
    }
  }
};

function onChange(event) {
  const node = event.target;
  if ('savedValue' in node) {
    const currentValue = node.type === 'checkbox' ? node.checked : node.value;
    setCleanItem(node, node.savedValue === currentValue);
  } else {
    // the manually added section's applies-to is dirty only when the value is non-empty
    setCleanItem(node, node.localName !== 'input' || !node.value.trim());
    // only valid when actually saved
    delete node.savedValue;
  }
  updateTitle();
}

// Set .dirty on stylesheet contributors that have changed
function setDirtyClass(node, isDirty) {
  node.classList.toggle('dirty', isDirty);
}

function setCleanItem(node, isClean) {
  if (!node.id) {
    node.id = Date.now().toString(32).substr(-6);
  }

  if (isClean) {
    delete dirty[node.id];
    // code sections have .CodeMirror property
    if (node.CodeMirror) {
      node.savedValue = node.CodeMirror.changeGeneration();
    } else {
      node.savedValue = node.type === 'checkbox' ? node.checked : node.value;
    }
  } else {
    dirty[node.id] = true;
  }

  setDirtyClass(node, !isClean);
}

function isCleanGlobal() {
  const clean = Object.keys(dirty).length === 0;
  setDirtyClass(document.body, !clean);
    // let saveBtn = $('#save-button')
    // if (clean){
    //     //saveBtn.removeAttribute('disabled');
    // }else{
    //     //saveBtn.setAttribute('disabled', true);
    // }
  return clean;
}

function setCleanGlobal() {
  $$('#header, #sections > div').forEach(setCleanSection);
  // forget the dirty applies-to ids from a deleted section after the style was saved
  dirty = {};
}

function setCleanSection(section) {
  $$('.style-contributor', section).forEach(node => { setCleanItem(node, true); });

  // #header section has no codemirror
  const cm = section.CodeMirror;
  if (cm) {
    section.savedValue = cm.changeGeneration();
    updateTitle();
  }
}

function initCodeMirror() {
  const CM = CodeMirror;
  const isWindowsOS = navigator.appVersion.indexOf('Windows') > 0;
  // lint.js is not loaded initially
  // CodeMirror miserably fails on keyMap='' so let's ensure it's not
  if (!prefs.get('editor.keyMap')) {
    prefs.reset('editor.keyMap');
  }

  // default option values
  Object.assign(CM.defaults, {
    mode: 'css',
    lineNumbers: true,
    lineWrapping: true,
    foldGutter: true,
    gutters: [
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
      ...(prefs.get('editor.linter') ? ['CodeMirror-lint-markers'] : []),
    ],
    matchBrackets: true,
    highlightSelectionMatches: {showToken: /[#.\-\w]/, annotateScrollbar: true},
    hintOptions: {},
    lint: linterConfig.getForCodeMirror(),
    lintReportDelay: prefs.get('editor.lintReportDelay'),
    styleActiveLine: true,
    theme: 'default',
    keyMap: prefs.get('editor.keyMap'),
    extraKeys: {
      // independent of current keyMap
      'Alt-Enter': 'toggleStyle',
      'Alt-PageDown': 'nextEditor',
      'Alt-PageUp': 'prevEditor'
    }
  }, prefs.get('editor.options'));

  // additional commands
  CM.commands.jumpToLine = jumpToLine;
  CM.commands.nextEditor = cm => nextPrevEditor(cm, 1);
  CM.commands.prevEditor = cm => nextPrevEditor(cm, -1);
  CM.commands.save = save;
  CM.commands.blockComment = cm => {
    cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), {fullLines: false});
  };
  CM.commands.toggleStyle = toggleStyle;

  // 'basic' keymap only has basic keys by design, so we skip it

  const extraKeysCommands = {};
  Object.keys(CM.defaults.extraKeys).forEach(key => {
    extraKeysCommands[CM.defaults.extraKeys[key]] = true;
  });
  if (!extraKeysCommands.jumpToLine) {
    CM.keyMap.sublime['Ctrl-G'] = 'jumpToLine';
    CM.keyMap.emacsy['Ctrl-G'] = 'jumpToLine';
    CM.keyMap.pcDefault['Ctrl-J'] = 'jumpToLine';
    CM.keyMap.macDefault['Cmd-J'] = 'jumpToLine';
  }
  if (!extraKeysCommands.autocomplete) {
    // will be used by 'sublime' on PC via fallthrough
    CM.keyMap.pcDefault['Ctrl-Space'] = 'autocomplete';
    // OSX uses Ctrl-Space and Cmd-Space for something else
    CM.keyMap.macDefault['Alt-Space'] = 'autocomplete';
    // copied from 'emacs' keymap
    CM.keyMap.emacsy['Alt-/'] = 'autocomplete';
    // 'vim' and 'emacs' define their own autocomplete hotkeys
  }
  if (!extraKeysCommands.blockComment) {
    CM.keyMap.sublime['Shift-Ctrl-/'] = 'blockComment';
  }

  if (isWindowsOS) {
    // 'pcDefault' keymap on Windows should have F3/Shift-F3
    if (!extraKeysCommands.findNext) {
      CM.keyMap.pcDefault['F3'] = 'findNext';
    }
    if (!extraKeysCommands.findPrev) {
      CM.keyMap.pcDefault['Shift-F3'] = 'findPrev';
    }

    // try to remap non-interceptable Ctrl-(Shift-)N/T/W hotkeys
    ['N', 'T', 'W'].forEach(char => {
      [
        {from: 'Ctrl-', to: ['Alt-', 'Ctrl-Alt-']},
        // Note: modifier order in CM is S-C-A
        {from: 'Shift-Ctrl-', to: ['Ctrl-Alt-', 'Shift-Ctrl-Alt-']}
      ].forEach(remap => {
        const oldKey = remap.from + char;
        Object.keys(CM.keyMap).forEach(keyMapName => {
          const keyMap = CM.keyMap[keyMapName];
          const command = keyMap[oldKey];
          if (!command) {
            return;
          }
          remap.to.some(newMod => {
            const newKey = newMod + char;
            if (!(newKey in keyMap)) {
              delete keyMap[oldKey];
              keyMap[newKey] = command;
              return true;
            }
          });
        });
      });
    });
  }

  // user option values
  CM.getOption = o => CodeMirror.defaults[o];
  CM.setOption = (o, v) => {
    CodeMirror.defaults[o] = v;
    editors.forEach(editor => {
      editor.setOption(o, v);
    });
  };

  CM.prototype.getSection = function () {
    return this.display.wrapper.parentNode;
  };

  // initialize global editor controls
  function optionsFromArray(parent, options) {
    const fragment = document.createDocumentFragment();
    for (const opt of options) {
      fragment.appendChild($element({tag: 'option', textContent: opt}));
    }
    parent.appendChild(fragment);
  }
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
  optionsFromArray($('#editor.keyMap'), Object.keys(CM.keyMap).sort());
  $('#options').addEventListener('change', acmeEventListener, false);
  setupLivePrefs();

  hotkeyRerouter.setState(true);
}

function acmeEventListener(event) {
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
      CodeMirror.setOption('indentUnit', Number(value));
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
      editors.forEach(cm => {
        const onOff = el.checked ? 'on' : 'off';
        cm[onOff]('changes', autocompleteOnTyping);
        cm[onOff]('pick', autocompletePicked);
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
  }
  CodeMirror.setOption(option, value);
}

// replace given textarea with the CodeMirror editor
function setupCodeMirror(textarea, index) {
  const cm = CodeMirror.fromTextArea(textarea, {lint: null});
  const wrapper = cm.display.wrapper;

  cm.on('changes', indicateCodeChangeDebounced);
  if (prefs.get('editor.autocompleteOnTyping')) {
    cm.on('changes', autocompleteOnTyping);
    cm.on('pick', autocompletePicked);
  }
  wrapper.addEventListener('keydown', event => nextPrevEditorOnKeydown(cm, event), true);
  cm.on('blur', () => {
    editors.lastActive = cm;
    hotkeyRerouter.setState(true);
    setTimeout(() => {
      wrapper.classList.toggle('CodeMirror-active', wrapper.contains(document.activeElement));
    });
  });
  cm.on('focus', () => {
    hotkeyRerouter.setState(false);
    wrapper.classList.add('CodeMirror-active');
  });
  cm.on('paste', (cm, event) => {
    const text = event.clipboardData.getData('text') || '';
    if (
      text.includes('@-moz-document') &&
      text.replace(/\/\*[\s\S]*?\*\//g, '')
        .match(/@-moz-document[\s\r\n]+(url|url-prefix|domain|regexp)\(/)
    ) {
      event.preventDefault();
      fromMozillaFormat();
      $('#help-popup').codebox.setValue(text);
      $('#help-popup').codebox.clearHistory();
      $('#help-popup').codebox.markClean();
    }
    if (editors.length === 1) {
      setTimeout(() => {
        if (cm.display.sizer.clientHeight > cm.display.wrapper.clientHeight) {
          maximizeCodeHeight.stats = null;
          maximizeCodeHeight(cm.getSection(), true);
        }
      });
    }
  });
  if (!FIREFOX) {
    cm.on('mousedown', (cm, event) => toggleContextMenuDelete.call(cm, event));
  }

  let lastClickTime = 0;
  const resizeGrip = wrapper.appendChild(template.resizeGrip.cloneNode(true));
  resizeGrip.onmousedown = event => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (Date.now() - lastClickTime < 500) {
      lastClickTime = 0;
      toggleSectionHeight(cm);
      return;
    }
    lastClickTime = Date.now();
    const minHeight = cm.defaultTextHeight() +
      /* .CodeMirror-lines padding */
      cm.display.lineDiv.offsetParent.offsetTop +
      /* borders */
      wrapper.offsetHeight - wrapper.clientHeight;
    wrapper.style.pointerEvents = 'none';
    document.body.style.cursor = 's-resize';
    function resize(e) {
      const cmPageY = wrapper.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(minHeight, e.pageY - cmPageY);
      if (height !== wrapper.clientHeight) {
        cm.setSize(null, height);
      }
    }
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', function resizeStop() {
      document.removeEventListener('mouseup', resizeStop);
      document.removeEventListener('mousemove', resize);
      wrapper.style.pointerEvents = '';
      document.body.style.cursor = '';
    });
  };

  editors.splice(index || editors.length, 0, cm);
  return cm;
}

function indicateCodeChange(cm) {
  const section = cm.getSection();
  setCleanItem(section, cm.isClean(section.savedValue));
  updateTitle();
  updateLintReportIfEnabled(cm);
}

function indicateCodeChangeDebounced(cm, ...args) {
  clearTimeout(cm.state.stylusOnChangeTimer);
  cm.state.stylusOnChangeTimer = setTimeout(indicateCodeChange, 200, cm, ...args);
}

function getSectionForChild(e) {
  return e.closest('#sections > div');
}

function getSections() {
  return $$('#sections > div');
}

// remind Chrome to repaint a previously invisible editor box by toggling any element's transform
// this bug is present in some versions of Chrome (v37-40 or something)
document.addEventListener('scroll', () => {
  const style = $('#name').style;
  style.webkitTransform = style.webkitTransform ? '' : 'scale(1)';
});

// Shift-Ctrl-Wheel scrolls entire page even when mouse is over a code editor
document.addEventListener('wheel', event => {
  if (event.shiftKey && event.ctrlKey && !event.altKey && !event.metaKey) {
    // Chrome scrolls horizontally when Shift is pressed but on some PCs this might be different
    window.scrollBy(0, event.deltaX || event.deltaY);
    event.preventDefault();
  }
});

queryTabs({currentWindow: true}).then(tabs => {
  const windowId = tabs[0].windowId;
  if (prefs.get('openEditInWindow')) {
    if (
      /true/.test(sessionStorage.saveSizeOnClose) &&
      'left' in prefs.get('windowPosition', {}) &&
      !isWindowMaximized()
    ) {
      // window was reopened via Ctrl-Shift-T etc.
      chrome.windows.update(windowId, prefs.get('windowPosition'));
    }
    if (tabs.length === 1 && window.history.length === 1) {
      chrome.windows.getAll(windows => {
        if (windows.length > 1) {
          sessionStorageHash('saveSizeOnClose').set(windowId, true);
          saveSizeOnClose = true;
        }
      });
    } else {
      saveSizeOnClose = sessionStorageHash('saveSizeOnClose').value[windowId];
    }
  }
  chrome.tabs.onRemoved.addListener((tabId, info) => {
    sessionStorageHash('manageStylesHistory').unset(tabId);
    if (info.windowId === windowId && info.isWindowClosing) {
      sessionStorageHash('saveSizeOnClose').unset(windowId);
    }
  });
});

getOwnTab().then(tab => {
  const ownTabId = tab.id;
  useHistoryBack = sessionStorageHash('manageStylesHistory').value[ownTabId] === location.href;
  // When an edit page gets attached or detached, remember its state
  // so we can do the same to the next one to open.
  chrome.tabs.onAttached.addListener((tabId, info) => {
    if (tabId !== ownTabId) {
      return;
    }
    if (info.newPosition !== 0) {
      prefs.set('openEditInWindow', false);
      return;
    }
    chrome.windows.get(info.newWindowId, {populate: true}, win => {
      // If there's only one tab in this window, it's been dragged to new window
      const openEditInWindow = win.tabs.length === 1;
      if (openEditInWindow && FIREFOX) {
        // FF-only because Chrome retardedly resets the size during dragging
        chrome.windows.update(info.newWindowId, prefs.get('windowPosition'));
      }
      prefs.set('openEditInWindow', openEditInWindow);
    });
  });
});

function goBackToManage(event) {
  if (useHistoryBack) {
    event.stopPropagation();
    event.preventDefault();
    history.back();
  }
}

function isWindowMaximized() {
  return (
    window.screenX <= 0 &&
    window.screenY <= 0 &&
    window.outerWidth >= screen.availWidth &&
    window.outerHeight >= screen.availHeight &&

    window.screenX > -10 &&
    window.screenY > -10 &&
    window.outerWidth < screen.availWidth + 10 &&
    window.outerHeight < screen.availHeight + 10
  );
}

function rememberWindowSize() {
  if (
    document.visibilityState === 'visible' &&
    prefs.get('openEditInWindow') &&
    !isWindowMaximized()
  ) {
    prefs.set('windowPosition', {
      left: window.screenX,
      top: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    });
  }
}

window.onbeforeunload = () => {
  if (saveSizeOnClose) {
    rememberWindowSize();
  }
  document.activeElement.blur();
  if (isCleanGlobal()) {
    return;
  }
  updateLintReportIfEnabled(null, 0);
  // neither confirm() nor custom messages work in modern browsers but just in case
  return t('styleChangesNotSaved');
};

function addAppliesTo(list, name, value) {
  const showingEverything = $('.applies-to-everything', list) !== null;
  // blow away 'Everything' if it's there
  if (showingEverything) {
    list.removeChild(list.firstChild);
  }
  let e;
  if (name && value) {
    e = template.appliesTo.cloneNode(true);
    $('[name=applies-type]', e).value = name;
    $('[name=applies-value]', e).value = value;
    $('.remove-applies-to', e).addEventListener('click', removeAppliesTo, false);
  } else if (showingEverything || list.hasChildNodes()) {
    e = template.appliesTo.cloneNode(true);
    if (list.hasChildNodes()) {
      $('[name=applies-type]', e).value = $('li:last-child [name="applies-type"]', list).value;
    }
    $('.remove-applies-to', e).addEventListener('click', removeAppliesTo, false);
  } else {
    e = template.appliesToEverything.cloneNode(true);
  }
  $('.add-applies-to', e).addEventListener('click', function () {
    addAppliesTo(this.parentNode.parentNode);
  }, false);
  list.appendChild(e);
}

function addSection(event, section) {
  const div = template.section.cloneNode(true);
  $('.applies-to-help', div).addEventListener('click', showAppliesToHelp, false);
  $('.remove-section', div).addEventListener('click', removeSection, false);
  $('.add-section', div).addEventListener('click', addSection, false);
  $('.beautify-section', div).addEventListener('click', beautify);

  const codeElement = $('.code', div);
  const appliesTo = $('.applies-to-list', div);
  let appliesToAdded = false;

  if (section) {
    codeElement.value = section.code;
    for (const i in propertyToCss) {
      if (section[i]) {
        section[i].forEach(url => {
          addAppliesTo(appliesTo, propertyToCss[i], url);
          appliesToAdded = true;
        });
      }
    }
  }
  if (!appliesToAdded) {
    addAppliesTo(appliesTo);
  }

  appliesTo.addEventListener('change', onChange);
  appliesTo.addEventListener('input', onChange);

  toggleTestRegExpVisibility();
  appliesTo.addEventListener('change', toggleTestRegExpVisibility);
  $('.test-regexp', div).onclick = showRegExpTester;
  function toggleTestRegExpVisibility() {
    const show = [...appliesTo.children].some(item =>
      !item.matches('.applies-to-everything') &&
      $('.applies-type', item).value === 'regexp' &&
      $('.applies-value', item).value.trim()
    );
    div.classList.toggle('has-regexp', show);
    appliesTo.oninput = appliesTo.oninput || show && (event => {
      if (
        event.target.matches('.applies-value') &&
        $('.applies-type', event.target.parentElement).value === 'regexp'
      ) {
        showRegExpTester(null, div);
      }
    });
  }

  const sections = $('#sections');
  let cm;
  if (event) {
    const clickedSection = getSectionForChild(event.target);
    sections.insertBefore(div, clickedSection.nextElementSibling);
    const newIndex = getSections().indexOf(clickedSection) + 1;
    cm = setupCodeMirror(codeElement, newIndex);
    makeSectionVisible(cm);
    cm.focus();
    renderLintReport();
  } else {
    sections.appendChild(div);
    cm = setupCodeMirror(codeElement);
  }
  div.CodeMirror = cm;
  setCleanSection(div);
  return div;
}

function removeAppliesTo(event) {
  const appliesTo = event.target.parentNode;
  const appliesToList = appliesTo.parentNode;
  removeAreaAndSetDirty(appliesTo);
  if (!appliesToList.hasChildNodes()) {
    addAppliesTo(appliesToList);
  }
}

function removeSection(event) {
  const section = getSectionForChild(event.target);
  const cm = section.CodeMirror;
  removeAreaAndSetDirty(section);
  editors.splice(editors.indexOf(cm), 1);
  renderLintReport();
}

function removeAreaAndSetDirty(area) {
  const contributors = $$('.style-contributor', area);
  if (!contributors.length) {
    setCleanItem(area, false);
  }
  contributors.some(node => {
    if (node.savedValue) {
      // it's a saved section, so make it dirty and stop the enumeration
      setCleanItem(area, false);
      return true;
    } else {
      // it's an empty section, so undirty the applies-to items,
      // otherwise orphaned ids would keep the style dirty
      setCleanItem(node, true);
    }
  });
  updateTitle();
  area.parentNode.removeChild(area);
}

function makeSectionVisible(cm) {
  const section = cm.getSection();
  const bounds = section.getBoundingClientRect();
  if (
    (bounds.bottom > window.innerHeight && bounds.top > 0) ||
    (bounds.top < 0 && bounds.bottom < window.innerHeight)
  ) {
    if (bounds.top < 0) {
      window.scrollBy(0, bounds.top - 1);
    } else {
      window.scrollBy(0, bounds.bottom - window.innerHeight + 1);
    }
  }
}

function setupGlobalSearch() {
  const originalCommand = {
    find: CodeMirror.commands.find,
    findNext: CodeMirror.commands.findNext,
    findPrev: CodeMirror.commands.findPrev,
    replace: CodeMirror.commands.replace
  };
  const originalOpenDialog = CodeMirror.prototype.openDialog;
  const originalOpenConfirm = CodeMirror.prototype.openConfirm;

  // cm.state.search for last used 'find'
  let curState;

  function shouldIgnoreCase(query) {
    // treat all-lowercase non-regexp queries as case-insensitive
    return typeof query === 'string' && query === query.toLowerCase();
  }

  function updateState(cm, newState) {
    if (!newState) {
      if (cm.state.search) {
        return cm.state.search;
      }
      if (!curState) {
        return null;
      }
      newState = curState;
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
      originalOpenDialog.call(cm, template.cloneNode(true), callback.bind(cb), opt);
    };
    setTimeout(() => { cm.openDialog = originalOpenDialog; }, 0);
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
      curState = activeCM.state.search;
      if (editors.length === 1 || !curState.query) {
        return;
      }
      editors.forEach(cm => {
        if (cm !== activeCM) {
          cm.execCommand('clearSearch');
          updateState(cm, curState);
        }
      });
      if (CodeMirror.cmpPos(curState.posFrom, curState.posTo) === 0) {
        findNext(activeCM);
      }
    });
    originalCommand.find(activeCM);
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
        originalCommand[reverse ? 'findPrev' : 'findNext'](cm);
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
    originalCommand[reverse ? 'findPrev' : 'findNext'](activeCM);

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
      customizeOpenDialog(activeCM, template.replaceWith, function (txt) {
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
    originalCommand.replace(activeCM, all);

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
          cm.openDialog = originalOpenDialog;
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
      originalCommand.replace(cm, all);
    }
    function doConfirm(cm) {
      let wrapAround = false;
      const origPos = cm.getCursor();
      cm.openConfirm = function overrideConfirm(tmpl, callbacks, opt) {
        const ovrCallbacks = callbacks.map(callback => () => {
          makeSectionVisible(cm);
          cm.openConfirm = overrideConfirm;
          setTimeout(() => { cm.openConfirm = originalOpenConfirm; }, 0);

          const pos = cm.getCursor();
          callback();
          const cmp = CodeMirror.cmpPos(cm.getCursor(), pos);
          wrapAround |= cmp <= 0;

          const dlg = $('.CodeMirror-dialog', cm.getWrapperElement());
          if (!dlg || cmp === 0 || wrapAround && CodeMirror.cmpPos(cm.getCursor(), origPos) >= 0) {
            if (dlg) {
              dlg.remove();
            }
            doReplace();
          }
        });
        originalOpenConfirm.call(cm, template.replaceConfirm.cloneNode(true), ovrCallbacks, opt);
      };
    }
  }

  function replaceAll(cm) {
    replace(cm, true);
  }

  CodeMirror.commands.find = find;
  CodeMirror.commands.findNext = findNext;
  CodeMirror.commands.findPrev = findPrev;
  CodeMirror.commands.replace = replace;
  CodeMirror.commands.replaceAll = replaceAll;
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

function toggleStyle() {
  $('#enabled').checked = !$('#enabled').checked;
  save();
}

function toggleSectionHeight(cm) {
  if (cm.state.toggleHeightSaved) {
    // restore previous size
    cm.setSize(null, cm.state.toggleHeightSaved);
    cm.state.toggleHeightSaved = 0;
  } else {
    // maximize
    const wrapper = cm.display.wrapper;
    const allBounds = $('#sections').getBoundingClientRect();
    const pageExtrasHeight = allBounds.top + window.scrollY +
      parseFloat(getComputedStyle($('#sections')).paddingBottom);
    const sectionExtrasHeight = cm.getSection().clientHeight - wrapper.offsetHeight;
    cm.state.toggleHeightSaved = wrapper.clientHeight;
    cm.setSize(null, window.innerHeight - sectionExtrasHeight - pageExtrasHeight);
    const bounds = cm.getSection().getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      window.scrollBy(0, bounds.top);
    }
  }
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
  if (info.text.last.match(/[-\w!]+$/)) {
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
  }, 0);
}

function nextPrevEditor(cm, direction) {
  cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
  makeSectionVisible(cm);
  cm.focus();
  return cm;
}

function nextPrevEditorOnKeydown(cm, event) {
  const key = event.which;
  if (key < 37 || key > 40 || event.shiftKey || event.altKey || event.metaKey) {
    return;
  }
  const {line, ch} = cm.getCursor();
  switch (key) {
    case 37:
      // arrow Left
      if (line || ch) {
        return;
      }
    // fallthrough to arrow Up
    case 38:
      // arrow Up
      if (line > 0 || cm === editors[0]) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cm = nextPrevEditor(cm, -1);
      cm.setCursor(cm.doc.size - 1, key === 37 ? 1e20 : ch);
      break;
    case 39:
      // arrow Right
      if (line < cm.doc.size - 1 || ch < cm.getLine(line).length - 1) {
        return;
      }
    // fallthrough to arrow Down
    case 40:
      // arrow Down
      if (line < cm.doc.size - 1 || cm === editors.last) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cm = nextPrevEditor(cm, 1);
      cm.setCursor(0, 0);
      break;
  }
  const animation = (cm.getSection().firstElementChild.getAnimations() || [])[0];
  if (animation) {
    animation.playbackRate = -1;
    animation.currentTime = 2000;
    animation.play();
  }
}

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
    let cm, distance;
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
    cm = editors[b];
    if (distances[b] > 0) {
      makeSectionVisible(cm);
    }
    return cm;
  }
}

function beautify(event) {
  onDOMscripted([
    'vendor-overwrites/beautify/beautify-css-mod.js',
    () => {
      if (!window.css_beautify && window.exports) {
        window.css_beautify = window.exports.css_beautify;
      }
    },
  ]).then(doBeautify);

  function doBeautify() {
    const tabs = prefs.get('editor.indentWithTabs');
    const options = prefs.get('editor.beautify');
    options.indent_size = tabs ? 1 : prefs.get('editor.tabSize');
    options.indent_char = tabs ? '\t' : ' ';

    const section = getSectionForChild(event.target);
    const scope = section ? [section.CodeMirror] : editors;

    showHelp(t('styleBeautify'), '<div class="beautify-options">' +
      optionHtml('.selector1,', 'selector_separator_newline') +
      optionHtml('.selector2,', 'newline_before_open_brace') +
      optionHtml('{', 'newline_after_open_brace') +
      optionHtml('border: none;', 'newline_between_properties', true) +
      optionHtml('display: block;', 'newline_before_close_brace', true) +
      optionHtml('}', 'newline_between_rules') +
      `<label style="display: block; clear: both;"><input data-option="indent_conditional" type="checkbox"
        ${options.indent_conditional !== false ? 'checked' : ''}>` +
        t('styleBeautifyIndentConditional') + '</label>' +
      '</div>' +
      '<div><button role="undo"></button></div>');

    const undoButton = $('#help-popup button[role="undo"]');
    undoButton.textContent = t(scope.length === 1 ? 'undo' : 'undoGlobal');
    undoButton.addEventListener('click', () => {
      let undoable = false;
      scope.forEach(cm => {
        if (cm.beautifyChange && cm.beautifyChange[cm.changeGeneration()]) {
          delete cm.beautifyChange[cm.changeGeneration()];
          cm.undo();
          cm.scrollIntoView(cm.getCursor());
          undoable |= cm.beautifyChange[cm.changeGeneration()];
        }
      });
      undoButton.disabled = !undoable;
    });

    scope.forEach(cm => {
      setTimeout(() => {
        const pos = options.translate_positions =
          [].concat.apply([], cm.doc.sel.ranges.map(r =>
            [Object.assign({}, r.anchor), Object.assign({}, r.head)]));
        const text = cm.getValue();
        const newText = css_beautify(text, options);
        if (newText !== text) {
          if (!cm.beautifyChange || !cm.beautifyChange[cm.changeGeneration()]) {
            // clear the list if last change wasn't a css-beautify
            cm.beautifyChange = {};
          }
          cm.setValue(newText);
          const selections = [];
          for (let i = 0; i < pos.length; i += 2) {
            selections.push({anchor: pos[i], head: pos[i + 1]});
          }
          cm.setSelections(selections);
          cm.beautifyChange[cm.changeGeneration()] = true;
          undoButton.disabled = false;
        }
      }, 0);
    });

    $('.beautify-options').onchange = ({target}) => {
      const value = target.type === 'checkbox' ? target.checked : target.selectedIndex > 0;
      prefs.set('editor.beautify', Object.assign(options, {[target.dataset.option]: value}));
      if (target.parentNode.hasAttribute('newline')) {
        target.parentNode.setAttribute('newline', value.toString());
      }
      doBeautify();
    };

    function optionHtml(label, optionName, indent) {
      const value = options[optionName];
      return '<div newline="' + value.toString() + '">' +
        '<span' + (indent ? ' indent' : '') + '>' + label + '</span>' +
        '<select data-option="' + optionName + '">' +
          '<option' + (value ? '' : ' selected') + '>&nbsp;</option>' +
          '<option' + (value ? ' selected' : '') + '>\\n</option>' +
        '</select></div>';
    }
  }
}

onDOMready().then(init);

function init() {
  initCodeMirror();
  const params = getParams();
  if (!params.id) {
    // match should be 2 - one for the whole thing, one for the parentheses
    // This is an add
    $('#heading').textContent = t('addStyleTitle');
    const section = {code: ''};
    for (const i in CssToProperty) {
      if (params[i]) {
        section[CssToProperty[i]] = [params[i]];
      }
    }
    addSection(null, section);
    editors[0].setOption('lint', CodeMirror.defaults.lint);
    editors[0].focus();
    // default to enabled
    $('#enabled').checked = true;
    initHooks();
    setCleanGlobal();
    updateTitle();
    return;
  }
  // This is an edit
  $('#heading').textContent = t('editStyleHeading');
  getStylesSafe({id: params.id}).then(styles => {
    let style = styles[0];
    if (!style) {
      style = {id: null, sections: []};
      history.replaceState({}, document.title, location.pathname);
    }
    styleId = style.id;
    sessionStorage.justEditedStyleId = styleId;
    setStyleMeta(style);
    window.onload = () => {
      window.onload = null;
      initWithStyle({style});
    };
    if (document.readyState !== 'loading') {
      window.onload();
    }
  });
}

function setStyleMeta(style) {
  $('#name').value = style.name || '';
  $('#enabled').checked = style.enabled !== false;
  $('#url').href = style.url || '';
}

function initWithStyle({style, codeIsUpdated}) {
  setStyleMeta(style);

  if (codeIsUpdated === false) {
    setCleanGlobal();
    updateTitle();
    return;
  }
  // if this was done in response to an update, we need to clear existing sections
  editors.length = 0;
  getSections().forEach(div => div.remove());
  const queue = style.sections.length ? style.sections.slice() : [{code: ''}];
  const t0 = performance.now();
  maximizeCodeHeight.stats = null;
  // after 100ms the sections will be added asynchronously
  while (performance.now() - t0 <= 100 && queue.length) {
    add();
  }
  (function processQueue() {
    if (queue.length) {
      add();
      setTimeout(processQueue);
      if (performance.now() - t0 > 500) {
        setGlobalProgress(editors.length, style.sections.length);
      }
    } else {
      setGlobalProgress();
    }
  })();
  editors[0].focus();
  initHooks();
  setCleanGlobal();
  updateTitle();

  function add() {
    const sectionDiv = addSection(null, queue.shift());
    maximizeCodeHeight(sectionDiv, !queue.length);
    if (!queue.length) {
      editors.last.state.renderLintReportNow = true;
    }
  }
}

function initHooks() {
  if (initHooks.alreadyDone) {
    return;
  }
  initHooks.alreadyDone = true;
  $$('#header .style-contributor').forEach(node => {
    node.addEventListener('change', onChange);
    node.addEventListener('input', onChange);
  });
  $('#toggle-style-help').addEventListener('click', showToggleStyleHelp);
  $('#to-mozilla').addEventListener('click', showMozillaFormat, false);
  $('#to-mozilla-help').addEventListener('click', showToMozillaHelp, false);
  $('#from-mozilla').addEventListener('click', fromMozillaFormat);
  $('#beautify').addEventListener('click', beautify);
  $('#save-button').addEventListener('click', save, false);
  $('#sections-help').addEventListener('click', showSectionHelp, false);
  $('#keyMap-help').addEventListener('click', showKeyMapHelp, false);
  $('#cancel-button').addEventListener('click', goBackToManage);

  $('#options').open = prefs.get('editor.options.expanded');
  $('#options h2').addEventListener('click', () => {
    setTimeout(() => prefs.set('editor.options.expanded', $('#options').open));
  });
  prefs.subscribe(['editor.options.expanded'], (key, value) => {
    $('#options').open = value;
  });

  initLint();

  if (!FIREFOX) {
    $$([
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="number"]',
    ].join(',')
    ).forEach(e => e.addEventListener('mousedown', toggleContextMenuDelete));
  }

  window.addEventListener('load', function _() {
    window.removeEventListener('load', _);
    window.addEventListener('resize', () => debounce(rememberWindowSize, 100));
  });

  setupGlobalSearch();
}


function toggleContextMenuDelete(event) {
  if (event.button === 2 && prefs.get('editor.contextDelete')) {
    chrome.contextMenus.update('editor.contextDelete', {
      enabled: Boolean(
        this.selectionStart !== this.selectionEnd ||
        this.somethingSelected && this.somethingSelected()
      ),
    }, ignoreChromeError);
  }
}


function maximizeCodeHeight(sectionDiv, isLast) {
  const cm = sectionDiv.CodeMirror;
  const stats = maximizeCodeHeight.stats = maximizeCodeHeight.stats || {totalHeight: 0, deltas: []};
  if (!stats.cmActualHeight) {
    stats.cmActualHeight = getComputedHeight(cm.display.wrapper);
  }
  if (!stats.sectionMarginTop) {
    stats.sectionMarginTop = parseFloat(getComputedStyle(sectionDiv).marginTop);
  }
  const sectionTop = sectionDiv.getBoundingClientRect().top - stats.sectionMarginTop;
  if (!stats.firstSectionTop) {
    stats.firstSectionTop = sectionTop;
  }
  const extrasHeight = getComputedHeight(sectionDiv) - stats.cmActualHeight;
  const cmMaxHeight = window.innerHeight - extrasHeight - sectionTop - stats.sectionMarginTop;
  const cmDesiredHeight = cm.display.sizer.clientHeight + 2 * cm.defaultTextHeight();
  const cmGrantableHeight = Math.max(stats.cmActualHeight, Math.min(cmMaxHeight, cmDesiredHeight));
  stats.deltas.push(cmGrantableHeight - stats.cmActualHeight);
  stats.totalHeight += cmGrantableHeight + extrasHeight;
  if (!isLast) {
    return;
  }
  stats.totalHeight += stats.firstSectionTop;
  if (stats.totalHeight <= window.innerHeight) {
    editors.forEach((cm, index) => {
      cm.setSize(null, stats.deltas[index] + stats.cmActualHeight);
    });
    return;
  }
  // scale heights to fill the gap between last section and bottom edge of the window
  const sections = $('#sections');
  const available = window.innerHeight - sections.getBoundingClientRect().bottom -
    parseFloat(getComputedStyle(sections).marginBottom);
  if (available <= 0) {
    return;
  }
  const totalDelta = stats.deltas.reduce((sum, d) => sum + d, 0);
  const q = available / totalDelta;
  const baseHeight = stats.cmActualHeight - stats.sectionMarginTop;
  stats.deltas.forEach((delta, index) => {
    editors[index].setSize(null, baseHeight + Math.floor(q * delta));
  });
}

function updateTitle() {
  const DIRTY_TITLE = '* $';

  const name = $('#name').savedValue;
  const clean = isCleanGlobal();
  const title = styleId === null ? t('addStyleTitle') : t('editStyleTitle', [name]);
  document.title = clean ? title : DIRTY_TITLE.replace('$', title);
}

function validate() {
  const name = $('#name').value;
  if (name === '') {
    $('#name').focus();
    return t('styleMissingName');
  }
  // validate the regexps
  if ($$('.applies-to-list').some(list => {
    list.childNodes.some(li => {
      if (li.className === template.appliesToEverything.className) {
        return false;
      }
      const valueElement = $('[name=applies-value]', li);
      const type = $('[name=applies-type]', li).value;
      const value = valueElement.value;
      if (type && value) {
        if (type === 'regexp') {
          try {
            new RegExp(value);
          } catch (ex) {
            valueElement.focus();
            return true;
          }
        }
      }
      return false;
    });
  })) {
    return t('styleBadRegexp');
  }
  return null;
}

function updateLintReportIfEnabled(...args) {
  if (CodeMirror.defaults.lint) {
    updateLintReport(...args);
  }
}

function save() {
  updateLintReportIfEnabled(null, 0);

  // save the contents of the CodeMirror editors back into the textareas
  for (let i = 0; i < editors.length; i++) {
    editors[i].save();
  }

  const error = validate();
  if (error) {
    alert(error);
    return;
  }
  const name = $('#name').value;
  const enabled = $('#enabled').checked;
  saveStyleSafe({
    id: styleId,
    name: name,
    enabled: enabled,
    reason: 'editSave',
    sections: getSectionsHashes()
  })
    .then(saveComplete);
}

function getSectionsHashes() {
  const sections = [];
  getSections().forEach(div => {
    const meta = getMeta(div);
    const code = div.CodeMirror.getValue();
    if (/^\s*$/.test(code) && Object.keys(meta).length === 0) {
      return;
    }
    meta.code = code;
    sections.push(meta);
  });
  return sections;
}

function getMeta(e) {
  const meta = {urls: [], urlPrefixes: [], domains: [], regexps: []};
  $('.applies-to-list', e).childNodes.forEach(li => {
    if (li.className === template.appliesToEverything.className) {
      return;
    }
    const type = $('[name=applies-type]', li).value;
    const value = $('[name=applies-value]', li).value;
    if (type && value) {
      const property = CssToProperty[type];
      meta[property].push(value);
    }
  });
  return meta;
}

function saveComplete(style) {
  styleId = style.id;
  sessionStorage.justEditedStyleId = styleId;
  setCleanGlobal();

  // Go from new style URL to edit style URL
  if (location.href.indexOf('id=') === -1) {
    history.replaceState({}, document.title, 'edit.html?id=' + style.id);
    $('#heading').textContent = t('editStyleHeading');
  }
  updateTitle();
}

function showMozillaFormat() {
  const popup = showCodeMirrorPopup(t('styleToMozillaFormatTitle'), '', {readOnly: true});
  popup.codebox.setValue(toMozillaFormat());
  popup.codebox.execCommand('selectAll');
}

function toMozillaFormat() {
  return getSectionsHashes().map(section => {
    let cssMds = [];
    for (const i in propertyToCss) {
      if (section[i]) {
        cssMds = cssMds.concat(section[i].map(v =>
          propertyToCss[i] + '("' + v.replace(/\\/g, '\\\\') + '")'
        ));
      }
    }
    return cssMds.length ? '@-moz-document ' + cssMds.join(', ') + ' {\n' + section.code + '\n}' : section.code;
  }).join('\n\n');
}

function fromMozillaFormat() {
  const popup = showCodeMirrorPopup(t('styleFromMozillaFormatPrompt'), tHTML(`<div>
      <button name="import-append" i18n-text="importAppendLabel" i18n-title="importAppendTooltip"></button>
      <button name="import-replace" i18n-text="importReplaceLabel" i18n-title="importReplaceTooltip"></button>
    </div>`
  ));

  const contents = $('.contents', popup);
  contents.insertBefore(popup.codebox.display.wrapper, contents.firstElementChild);
  popup.codebox.focus();

  $('[name="import-append"]', popup).addEventListener('click', doImport);
  $('[name="import-replace"]', popup).addEventListener('click', doImport);

  popup.codebox.on('change', () => {
    clearTimeout(popup.mozillaTimeout);
    popup.mozillaTimeout = setTimeout(() => {
      popup.classList.toggle('ready', trimNewLines(popup.codebox.getValue()));
    }, 100);
  });

  function doImport(event) {
    // parserlib contained in CSSLint-worker.js
    onDOMscripted(['vendor-overwrites/csslint/csslint-worker.js']).then(() => {
      doImportWhenReady(event.target);
      editors.forEach(cm => updateLintReportIfEnabled(cm, 1));
      editors.last.state.renderLintReportNow = true;
    });
  }

  function doImportWhenReady(target) {
    const replaceOldStyle = target.name === 'import-replace';
    $('.dismiss', popup).onclick();
    const mozStyle = trimNewLines(popup.codebox.getValue());
    const parser = new parserlib.css.Parser();
    const lines = mozStyle.split('\n');
    const sectionStack = [{code: '', start: {line: 1, col: 1}}];
    const errors = [];
    // let oldSectionCount = editors.length;
    let firstAddedCM;

    parser.addListener('startdocument', function (e) {
      let outerText = getRange(sectionStack.last.start, (--e.col, e));
      const gapComment = outerText.match(/(\/\*[\s\S]*?\*\/)[\s\n]*$/);
      const section = {code: '', start: backtrackTo(this, parserlib.css.Tokens.LBRACE, 'end')};
      // move last comment before @-moz-document inside the section
      if (gapComment && !gapComment[1].match(/\/\*\s*AGENT_SHEET\s*\*\//)) {
        section.code = gapComment[1] + '\n';
        outerText = trimNewLines(outerText.substring(0, gapComment.index));
      }
      if (outerText.trim()) {
        sectionStack.last.code = outerText;
        doAddSection(sectionStack.last);
        sectionStack.last.code = '';
      }
      for (const f of e.functions) {
        const m = f && f.match(/^([\w-]*)\((['"]?)(.+?)\2?\)$/);
        if (!m || !/^(url|url-prefix|domain|regexp)$/.test(m[1])) {
          errors.push(`${e.line}:${e.col + 1} invalid function "${m ? m[1] : f || ''}"`);
          continue;
        }
        const aType = CssToProperty[m[1]];
        const aValue = aType !== 'regexps' ? m[3] : m[3].replace(/\\\\/g, '\\');
        (section[aType] = section[aType] || []).push(aValue);
      }
      sectionStack.push(section);
    });

    parser.addListener('enddocument', function () {
      const end = backtrackTo(this, parserlib.css.Tokens.RBRACE, 'start');
      const section = sectionStack.pop();
      section.code += getRange(section.start, end);
      sectionStack.last.start = (++end.col, end);
      doAddSection(section);
    });

    parser.addListener('endstylesheet', () => {
      // add nonclosed outer sections (either broken or the last global one)
      const endOfText = {line: lines.length, col: lines.last.length + 1};
      sectionStack.last.code += getRange(sectionStack.last.start, endOfText);
      sectionStack.forEach(doAddSection);

      delete maximizeCodeHeight.stats;
      editors.forEach(cm => {
        maximizeCodeHeight(cm.getSection(), cm === editors.last);
      });

      makeSectionVisible(firstAddedCM);
      firstAddedCM.focus();

      if (errors.length) {
        showHelp(t('linterIssues'), $element({
          tag: 'pre',
          textContent: errors.join('\n'),
        }));
      }
    });

    parser.addListener('error', e => {
      errors.push(e.line + ':' + e.col + ' ' +
        e.message.replace(/ at line \d.+$/, ''));
    });

    parser.parse(mozStyle);

    function getRange(start, end) {
      const L1 = start.line - 1;
      const C1 = start.col - 1;
      const L2 = end.line - 1;
      const C2 = end.col - 1;
      if (L1 === L2) {
        return lines[L1].substr(C1, C2 - C1 + 1);
      } else {
        const middle = lines.slice(L1 + 1, L2).join('\n');
        return lines[L1].substr(C1) + '\n' + middle +
          (L2 >= lines.length ? '' : ((middle ? '\n' : '') + lines[L2].substring(0, C2)));
      }
    }
    function doAddSection(section) {
      section.code = section.code.trim();
      // don't add empty sections
      if (
        !section.code &&
        !section.urls &&
        !section.urlPrefixes &&
        !section.domains &&
        !section.regexps
      ) {
        return;
      }
      if (!firstAddedCM) {
        if (!initFirstSection(section)) {
          return;
        }
      }
      setCleanItem(addSection(null, section), false);
      firstAddedCM = firstAddedCM || editors.last;
    }
    // do onetime housekeeping as the imported text is confirmed to be a valid style
    function initFirstSection(section) {
      // skip adding the first global section when there's no code/comments
      if (
        /* ignore boilerplate NS */
        !section.code.replace('@namespace url(http://www.w3.org/1999/xhtml);', '')
          /* ignore all whitespace including new lines */
          .replace(/[\s\n]/g, '')
      ) {
        return false;
      }
      if (replaceOldStyle) {
        editors.slice(0).reverse().forEach(cm => {
          removeSection({target: cm.getSection().firstElementChild});
        });
      } else if (!editors.last.getValue()) {
        // nuke the last blank section
        if ($('.applies-to-everything', editors.last.getSection())) {
          removeSection({target: editors.last.getSection()});
        }
      }
      return true;
    }
  }
  function backtrackTo(parser, tokenType, startEnd) {
    const tokens = parser._tokenStream._lt;
    for (let i = parser._tokenStream._ltIndex - 1; i >= 0; --i) {
      if (tokens[i].type === tokenType) {
        return {line: tokens[i][startEnd + 'Line'], col: tokens[i][startEnd + 'Col']};
      }
    }
  }
  function trimNewLines(s) {
    return s.replace(/^[\s\n]+/, '').replace(/[\s\n]+$/, '');
  }
}

function showSectionHelp() {
  showHelp(t('styleSectionsTitle'), t('sectionHelp'));
}

function showAppliesToHelp() {
  showHelp(t('appliesLabel'), t('appliesHelp'));
}

function showToMozillaHelp() {
  showHelp(t('styleMozillaFormatHeading'), t('styleToMozillaFormatHelp'));
}

function showToggleStyleHelp() {
  showHelp(t('helpAlt'), t('styleEnabledToggleHint'));
}

function showKeyMapHelp() {
  const keyMap = mergeKeyMaps({}, prefs.get('editor.keyMap'), CodeMirror.defaults.extraKeys);
  const keyMapSorted = Object.keys(keyMap)
    .map(key => ({key: key, cmd: keyMap[key]}))
    .concat([{key: 'Shift-Ctrl-Wheel', cmd: 'scrollWindow'}])
    .sort((a, b) => (a.cmd < b.cmd || (a.cmd === b.cmd && a.key < b.key) ? -1 : 1));
  showHelp(t('cm_keyMap') + ': ' + prefs.get('editor.keyMap'),
    '<table class="keymap-list">' +
      '<thead><tr><th><input placeholder="' + t('helpKeyMapHotkey') + '" type="search"></th>' +
        '<th><input placeholder="' + t('helpKeyMapCommand') + '" type="search"></th></tr></thead>' +
      '<tbody>' + keyMapSorted.map(value =>
        '<tr><td>' + value.key + '</td><td>' + value.cmd + '</td></tr>'
      ).join('') +
      '</tbody>' +
    '</table>');

  const table = $('#help-popup table');
  table.addEventListener('input', filterTable);

  const inputs = $$('input', table);
  inputs[0].addEventListener('keydown', hotkeyHandler);
  inputs[1].focus();

  function hotkeyHandler(event) {
    const keyName = CodeMirror.keyName(event);
    if (keyName === 'Esc' || keyName === 'Tab' || keyName === 'Shift-Tab') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // normalize order of modifiers,
    // for modifier-only keys ('Ctrl-Shift') a dummy main key has to be temporarily added
    const keyMap = {};
    keyMap[keyName.replace(/(Shift|Ctrl|Alt|Cmd)$/, '$&-dummy')] = '';
    const normalizedKey = Object.keys(CodeMirror.normalizeKeyMap(keyMap))[0];
    this.value = normalizedKey.replace('-dummy', '');
    filterTable(event);
  }

  function filterTable(event) {
    const input = event.target;
    const col = input.parentNode.cellIndex;
    inputs[1 - col].value = '';
    table.tBodies[0].childNodes.forEach(row => {
      const cell = row.children[col];
      const text = cell.textContent;
      const query = stringAsRegExp(input.value, 'gi');
      const test = query.test(text);
      row.style.display = input.value && test === false ? 'none' : '';
      if (input.value && test) {
        cell.textContent = '';
        let offset = 0;
        text.replace(query, (match, index) => {
          if (index > offset) {
            cell.appendChild(document.createTextNode(text.substring(offset, index)));
          }
          cell.appendChild($element({tag: 'mark', textContent: match}));
          offset = index + match.length;
        });
        if (offset + 1 !== text.length) {
          cell.appendChild(document.createTextNode(text.substring(offset)));
        }
      }
      else {
        cell.textContent = text;
      }
      // clear highlight from the other column
      const otherCell = row.children[1 - col];
      if (otherCell.children.length) {
        const text = otherCell.textContent;
        otherCell.textContent = text;
      }
    });
  }
  function mergeKeyMaps(merged, ...more) {
    more.forEach(keyMap => {
      if (typeof keyMap === 'string') {
        keyMap = CodeMirror.keyMap[keyMap];
      }
      Object.keys(keyMap).forEach(key => {
        let cmd = keyMap[key];
        // filter out '...', 'attach', etc. (hotkeys start with an uppercase letter)
        if (!merged[key] && !key.match(/^[a-z]/) && cmd !== '...') {
          if (typeof cmd === 'function') {
            // for 'emacs' keymap: provide at least something meaningful (hotkeys and the function body)
            // for 'vim*' keymaps: almost nothing as it doesn't rely on CM keymap mechanism
            cmd = cmd.toString().replace(/^function.*?\{[\s\r\n]*([\s\S]+?)[\s\r\n]*\}$/, '$1');
            merged[key] = cmd.length <= 200 ? cmd : cmd.substr(0, 200) + '...';
          } else {
            merged[key] = cmd;
          }
        }
      });
      if (keyMap.fallthrough) {
        merged = mergeKeyMaps(merged, keyMap.fallthrough);
      }
    });
    return merged;
  }
}

function showRegExpTester(event, section = getSectionForChild(this)) {
  const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
  const OWN_ICON = chrome.runtime.getManifest().icons['16'];
  const cachedRegexps = showRegExpTester.cachedRegexps =
    showRegExpTester.cachedRegexps || new Map();
  const regexps = [...$('.applies-to-list', section).children]
    .map(item =>
      !item.matches('.applies-to-everything') &&
      $('.applies-type', item).value === 'regexp' &&
      $('.applies-value', item).value.trim()
    )
    .filter(item => item)
    .map(text => {
      const rxData = Object.assign({text}, cachedRegexps.get(text));
      if (!rxData.urls) {
        cachedRegexps.set(text, Object.assign(rxData, {
          // imitate buggy Stylish-for-chrome, see detectSloppyRegexps()
          rx: tryRegExp('^' + text + '$'),
          urls: new Map(),
        }));
      }
      return rxData;
    });
  chrome.tabs.onUpdated.addListener(function _(tabId, info) {
    if ($('.regexp-report')) {
      if (info.url) {
        showRegExpTester(event, section);
      }
    } else {
      chrome.tabs.onUpdated.removeListener(_);
    }
  });
  const getMatchInfo = m => m && {text: m[0], pos: m.index};

  queryTabs().then(tabs => {
    const supported = tabs.map(tab => tab.url)
      .filter(url => URLS.supported(url));
    const unique = [...new Set(supported).values()];
    for (const rxData of regexps) {
      const {rx, urls} = rxData;
      if (rx) {
        const urlsNow = new Map();
        for (const url of unique) {
          const match = urls.get(url) || getMatchInfo(url.match(rx));
          if (match) {
            urlsNow.set(url, match);
          }
        }
        rxData.urls = urlsNow;
      }
    }
    const stats = {
      full: {data: [], label: t('styleRegexpTestFull')},
      partial: {data: [], label: [
        t('styleRegexpTestPartial'),
        template.regexpTestPartial.cloneNode(true),
      ]},
      none: {data: [], label: t('styleRegexpTestNone')},
      invalid: {data: [], label: t('styleRegexpTestInvalid')},
    };
    // collect stats
    for (const {text, rx, urls} of regexps) {
      if (!rx) {
        stats.invalid.data.push({text});
        continue;
      }
      if (!urls.size) {
        stats.none.data.push({text});
        continue;
      }
      const full = [];
      const partial = [];
      for (const [url, match] of urls.entries()) {
        const faviconUrl = url.startsWith(URLS.ownOrigin)
          ? OWN_ICON
          : GET_FAVICON_URL + new URL(url).hostname;
        const icon = $element({tag: 'img', src: faviconUrl});
        if (match.text.length === url.length) {
          full.push($element({appendChild: [
            icon,
            url,
          ]}));
        } else {
          partial.push($element({appendChild: [
            icon,
            url.substr(0, match.pos),
            $element({tag: 'mark', textContent: match.text}),
            url.substr(match.pos + match.text.length),
          ]}));
        }
      }
      if (full.length) {
        stats.full.data.push({text, urls: full});
      }
      if (partial.length) {
        stats.partial.data.push({text, urls: partial});
      }
    }
    // render stats
    const report = $element({className: 'regexp-report'});
    const br = $element({tag: 'br'});
    for (const type in stats) {
      // top level groups: full, partial, none, invalid
      const {label, data} = stats[type];
      if (!data.length) {
        continue;
      }
      const block = report.appendChild($element({
        tag: 'details',
        open: true,
        dataset: {type},
        appendChild: $element({tag: 'summary', appendChild: label}),
      }));
      // 2nd level: regexp text
      for (const {text, urls} of data) {
        if (urls) {
          // type is partial or full
          block.appendChild($element({
            tag: 'details',
            open: true,
            appendChild: [
              $element({tag: 'summary', textContent: text}),
              // 3rd level: tab urls
              ...urls,
            ],
          }));
        } else {
          // type is none or invalid
          block.appendChild(document.createTextNode(text));
          block.appendChild(br.cloneNode());
        }
      }
    }
    showHelp(t('styleRegexpTestTitle'), report);

    $('.regexp-report').onclick = event => {
      const target = event.target.closest('a, .regexp-report div');
      if (target) {
        openURL({url: target.href || target.textContent});
        event.preventDefault();
      }
    };
  });
}

function showHelp(title, body) {
  const div = $('#help-popup');
  div.classList.remove('big');
  $('.contents', div).textContent = '';
  $('.contents', div).appendChild(typeof body === 'string' ? tHTML(body) : body);
  $('.title', div).textContent = title;

  if (getComputedStyle(div).display === 'none') {
    document.addEventListener('keydown', closeHelp);
    // avoid chaining on multiple showHelp() calls
    $('.dismiss', div).onclick = closeHelp;
  }

  div.style.display = 'block';
  return div;

  function closeHelp(e) {
    if (
      !e ||
      e.type === 'click' ||
      ((e.keyCode || e.which) === 27 && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey)
    ) {
      div.style.display = '';
      const contents = $('.contents');
      contents.textContent = '';
      clearTimeout(contents.timer);
      document.removeEventListener('keydown', closeHelp);
    }
  }
}

function showCodeMirrorPopup(title, html, options) {
  const popup = showHelp(title, html);
  popup.classList.add('big');

  popup.codebox = CodeMirror($('.contents', popup), Object.assign({
    mode: 'css',
    lineNumbers: true,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    matchBrackets: true,
    lint: linterConfig.getForCodeMirror(),
    styleActiveLine: true,
    theme: prefs.get('editor.theme'),
    keyMap: prefs.get('editor.keyMap')
  }, options));
  popup.codebox.focus();
  popup.codebox.on('focus', () => { hotkeyRerouter.setState(false); });
  popup.codebox.on('blur', () => { hotkeyRerouter.setState(true); });
  return popup;
}

function getParams() {
  const params = {};
  const urlParts = location.href.split('?', 2);
  if (urlParts.length === 1) {
    return params;
  }
  urlParts[1].split('&').forEach(keyValue => {
    const splitKeyValue = keyValue.split('=', 2);
    params[decodeURIComponent(splitKeyValue[0])] = decodeURIComponent(splitKeyValue[1]);
  });
  return params;
}

chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(request) {
  switch (request.method) {
    case 'styleUpdated':
      if (styleId && styleId === request.style.id && request.reason !== 'editSave') {
        if ((request.style.sections[0] || {}).code === null) {
          // the code-less style came from notifyAllTabs
          onBackgroundReady().then(() => {
            request.style = BG.cachedStyles.byId.get(request.style.id);
            initWithStyle(request);
          });
        } else {
          initWithStyle(request);
        }
      }
      break;
    case 'styleDeleted':
      if (styleId && styleId === request.id) {
        window.onbeforeunload = () => {};
        window.close();
        break;
      }
      break;
    case 'prefChanged':
      if ('editor.smartIndent' in request.prefs) {
        CodeMirror.setOption('smartIndent', request.prefs['editor.smartIndent']);
      }
      break;
    case 'editDeleteText':
      document.execCommand('delete');
      break;
  }
}

function getComputedHeight(el) {
  const compStyle = getComputedStyle(el);
  return el.getBoundingClientRect().height +
    parseFloat(compStyle.marginTop) + parseFloat(compStyle.marginBottom);
}


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

function setGlobalProgress(done, total) {
  const progressElement = $('#global-progress') ||
    total && document.body.appendChild($element({id: 'global-progress'}));
  if (total) {
    const progress = (done / Math.max(done, total) * 100).toFixed(1);
    progressElement.style.borderLeftWidth = progress + 'vw';
    setTimeout(() => {
      progressElement.title = progress + '%';
    });
  } else if (progressElement) {
    progressElement.remove();
  }
}
