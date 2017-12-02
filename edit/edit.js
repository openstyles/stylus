/* eslint brace-style: 0, operator-linebreak: 0 */
/* global CodeMirror parserlib */
/* global loadScript */
/* global css_beautify */
/* global CSSLint initLint linterConfig updateLintReport renderLintReport updateLinter */
/* global mozParser createSourceEditor */
/* global closeCurrentTab regExpTester messageBox */
/* global initColorpicker */
/* global initCollapsibles */
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

let editor;

Promise.all([
  initStyleData().then(style => {
    styleId = style.id;
    sessionStorage.justEditedStyleId = styleId;
    // we set "usercss" class on <html> when <body> is empty
    // so there'll be no flickering of the elements that depend on it
    if (isUsercss(style)) {
      document.documentElement.classList.add('usercss');
    }
    // strip URL parameters when invoked for a non-existent id
    if (!styleId) {
      history.replaceState({}, document.title, location.pathname);
    }
    return style;
  }),
  onDOMready(),
  onBackgroundReady(),
])
.then(([style]) => Promise.all([
  style,
  initColorpicker(),
  initCollapsibles(),
  initHooksCommon(),
]))
.then(([style]) => {
  initCodeMirror();

  const usercss = isUsercss(style);
  $('#heading').textContent = t(styleId ? 'editStyleHeading' : 'addStyleTitle');
  $('#name').placeholder = t(usercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
  $('#name').title = usercss ? t('usercssReplaceTemplateName') : '';

  if (usercss) {
    editor = createSourceEditor(style);
  } else {
    initWithSectionStyle({style});
  }

  // workaround part2 for the <details> not showing its toggle icon: hide <summary> on scroll
  $('#lint').addEventListener('scroll', function () {
    const newOpacity = this.scrollTop === 0 ? '' : '0';
    const style = this.firstElementChild.style;
    if (style.opacity !== newOpacity) {
      style.opacity = newOpacity;
    }
  }, {passive: true});
});

// make querySelectorAll enumeration code readable
['forEach', 'some', 'indexOf', 'map'].forEach(method => {
  NodeList.prototype[method] = Array.prototype[method];
});

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
    colorpicker: true,
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
  // lint.js is not loaded initially
  CM.defaults.lint = linterConfig.getForCodeMirror();

  // additional commands
  CM.commands.jumpToLine = jumpToLine;
  CM.commands.nextEditor = cm => nextPrevEditor(cm, 1);
  CM.commands.prevEditor = cm => nextPrevEditor(cm, -1);
  CM.commands.save = save;
  CM.commands.toggleStyle = toggleStyle;

  // user option values
  CM.getOption = o => CodeMirror.defaults[o];
  CM.setOption = (o, v) => {
    CodeMirror.defaults[o] = v;
    if (editors.length > 4 && (o === 'theme' || o === 'lineWrapping')) {
      throttleSetOption({key: o, value: v, index: 0});
      return;
    }
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

  const THROTTLE_AFTER_MS = 100;
  const THROTTLE_SHOW_PROGRESS_AFTER_MS = 100;

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

function setupCodeMirror(sectionDiv, code, index) {
  const cm = CodeMirror(wrapper => {
    $('.code-label', sectionDiv).insertAdjacentElement('afterend', wrapper);
  }, {
    value: code,
  });
  const wrapper = cm.display.wrapper;

  cm.on('changes', indicateCodeChangeDebounced);
  if (prefs.get('editor.autocompleteOnTyping')) {
    setupAutocomplete(cm);
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

  wrapper.classList.add('resize-grip-enabled');
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

chrome.windows && queryTabs({currentWindow: true}).then(tabs => {
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
});

getOwnTab().then(tab => {
  const ownTabId = tab.id;
  useHistoryBack = sessionStorageHash('manageStylesHistory').value[ownTabId] === location.href;
  if (!chrome.windows) {
    return;
  }
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
  if (isClean()) {
    return;
  }
  updateLintReportIfEnabled(null, 0);
  // neither confirm() nor custom messages work in modern browsers but just in case
  return t('styleChangesNotSaved');

  function isClean() {
    if (editor) {
      return !editor.isDirty();
    } else {
      return isCleanGlobal();
    }
  }
};

function addAppliesTo(list, name, value) {
  const showingEverything = $('.applies-to-everything', list) !== null;
  // blow away 'Everything' if it's there
  if (showingEverything) {
    list.removeChild(list.firstChild);
  }
  let e;
  if (name) {
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

  const code = (section || {}).code || '';

  const appliesTo = $('.applies-to-list', div);
  let appliesToAdded = false;

  if (section) {
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
  $('.test-regexp', div).onclick = () => {
    regExpTester.toggle();
    regExpTester.update(getRegExps());
  };

  function getRegExps() {
    return [...appliesTo.children]
      .map(item =>
        !item.matches('.applies-to-everything') &&
        $('.applies-type', item).value === 'regexp' &&
        $('.applies-value', item).value.trim()
      )
      .filter(item => item);
  }

  function toggleTestRegExpVisibility() {
    const show = getRegExps().length > 0;
    div.classList.toggle('has-regexp', show);
    appliesTo.oninput = appliesTo.oninput || show && (event => {
      if (
        event.target.matches('.applies-value') &&
        $('.applies-type', event.target.parentElement).value === 'regexp'
      ) {
        regExpTester.update(getRegExps());
      }
    });
  }

  const sections = $('#sections');
  let cm;
  if (event) {
    const clickedSection = getSectionForChild(event.target);
    sections.insertBefore(div, clickedSection.nextElementSibling);
    const newIndex = getSections().indexOf(clickedSection) + 1;
    cm = setupCodeMirror(div, code, newIndex);
    makeSectionVisible(cm);
    renderLintReport();
    cm.focus();
  } else {
    sections.appendChild(div);
    cm = setupCodeMirror(div, code);
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
            $.remove(dlg);
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
  if (editor) {
    editor.toggleStyle();
  } else {
    toggleSectionStyle();
  }
}

function toggleSectionStyle() {
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
  loadScript('/vendor-overwrites/beautify/beautify-css-mod.js')
    .then(() => {
      if (!window.css_beautify && window.exports) {
        window.css_beautify = window.exports.css_beautify;
      }
    })
    .then(doBeautify);

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

function initStyleData() {
  // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
  const params = new URLSearchParams(location.search.replace(/^\?/, ''));
  const id = params.get('id');
  const createEmptyStyle = () => ({
    id: null,
    name: '',
    enabled: true,
    sections: [
      Object.assign({code: ''},
        ...Object.keys(CssToProperty)
          .map(name => ({
            [CssToProperty[name]]: params.get(name) && [params.get(name)] || []
          }))
      )
    ],
  });
  return !id ?
    Promise.resolve(createEmptyStyle()) :
    getStylesSafe({id}).then(([style]) => style || createEmptyStyle());
}

function setStyleMeta(style) {
  $('#name').value = style.name || '';
  $('#enabled').checked = style.enabled !== false;
  $('#url').href = style.url || '';
}

function isUsercss(style) {
  return (
    style.usercssData ||
    !style.id && prefs.get('newStyleAsUsercss')
  );
}

function initWithSectionStyle({style, codeIsUpdated}) {
  setStyleMeta(style);
  if (codeIsUpdated !== false) {
    editors.length = 0;
    getSections().forEach(div => div.remove());
    addSections(style.sections.length ? style.sections : [{code: ''}]);
    initHooks();
  }
  setCleanGlobal();
  updateTitle();
}

function addSections(sections, onAdded = () => {}) {
  if (addSections.running) {
    console.error('addSections cannot be re-entered: please report to the developers');
    // TODO: handle this properly e.g. on update/import
    return;
  }
  addSections.running = true;
  maximizeCodeHeight.stats = null;
  // make a shallow copy since we might run asynchronously
  // and the original array might get modified
  sections = sections.slice();
  const t0 = performance.now();
  const divs = [];
  let index = 0;

  return new Promise(function run(resolve) {
    while (index < sections.length) {
      const div = addSection(null, sections[index]);
      maximizeCodeHeight(div, index === sections.length - 1);
      onAdded(div, index);
      divs.push(div);
      maybeFocusFirstCM();
      index++;
      const elapsed = performance.now() - t0;
      if (elapsed > 500) {
        setGlobalProgress(index, sections.length);
      }
      if (elapsed > 100) {
        // after 100ms the sections are added asynchronously
        setTimeout(run, 0, resolve);
        return;
      }
    }
    editors.last.state.renderLintReportNow = true;
    addSections.running = false;
    setGlobalProgress();
    resolve(divs);
  });

  function maybeFocusFirstCM() {
    const isPageLocked = document.documentElement.style.pointerEvents;
    if (divs[0] && (isPageLocked ? divs.length === sections.length : index === 0)) {
      makeSectionVisible(divs[0].CodeMirror);
      divs[0].CodeMirror.focus();
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

  setupGlobalSearch();
}

// common for usercss and classic
function initHooksCommon() {
  showKeyInSaveButtonTooltip();
  prefs.subscribe(['editor.keyMap'], showKeyInSaveButtonTooltip);
  window.addEventListener('resize', () => debounce(rememberWindowSize, 100));

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
}

function toggleContextMenuDelete(event) {
  if (chrome.contextMenus && event.button === 2 && prefs.get('editor.contextDelete')) {
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
  if (editor) {
    editor.save();
  } else {
    saveSectionStyle();
  }
}

function saveSectionStyle() {
  updateLintReportIfEnabled(null, 0);

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
  return mozParser.format({sections: getSectionsHashes()});
}

function fromMozillaFormat() {
  const popup = showCodeMirrorPopup(t('styleFromMozillaFormatPrompt'),
    $element({appendChild: [
      $element({
        tag: 'button',
        name: 'import-append',
        textContent: t('importAppendLabel'),
        title: 'Ctrl-Enter:\n' + t('importAppendTooltip'),
        onclick: doImport,
      }),
      $element({
        tag: 'button',
        name: 'import-replace',
        textContent: t('importReplaceLabel'),
        title: 'Ctrl-Shift-Enter:\n' + t('importReplaceTooltip'),
        onclick: () => doImport({replaceOldStyle: true}),
      }),
    ]}));
  const contents = $('.contents', popup);
  contents.insertBefore(popup.codebox.display.wrapper, contents.firstElementChild);
  popup.codebox.focus();
  popup.codebox.on('changes', cm => {
    popup.classList.toggle('ready', !cm.isBlank());
    cm.markClean();
  });
  // overwrite default extraKeys as those are inapplicable in popup context
  popup.codebox.options.extraKeys = {
    'Ctrl-Enter': doImport,
    'Shift-Ctrl-Enter': () => doImport({replaceOldStyle: true}),
  };

  function doImport({replaceOldStyle = false}) {
    lockPageUI(true);
    new Promise(setTimeout)
      .then(() => mozParser.parse(popup.codebox.getValue().trim()))
      .then(sections => {
        removeOldSections(replaceOldStyle);
        return addSections(sections, div => setCleanItem(div, false));
      })
      .then(sectionDivs => {
        sectionDivs.forEach(div => updateLintReportIfEnabled(div.CodeMirror, 1));
        $('.dismiss', popup).onclick();
      })
      .catch(showError)
      .then(() => lockPageUI(false));
  }

  function removeOldSections(removeAll) {
    let toRemove;
    if (removeAll) {
      toRemove = editors.slice().reverse();
    } else if (editors.last.isBlank() && $('.applies-to-everything', editors.last.getSection())) {
      toRemove = [editors.last];
    } else {
      return;
    }
    toRemove.forEach(cm => removeSection({target: cm.getSection()}));
  }

  function lockPageUI(locked) {
    document.documentElement.style.pointerEvents = locked ? 'none' : '';
    popup.classList.toggle('ready', locked ? false : !popup.codebox.isBlank());
    popup.codebox.options.readOnly = locked;
    popup.codebox.display.wrapper.style.opacity = locked ? '.5' : '';
  }

  function showError(errors) {
    showHelp(t('styleFromMozillaFormatError'), $element({
      tag: 'pre',
      textContent: Array.isArray(errors) ? errors.join('\n') : errors,
    }));
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

function showHelp(title = '', body) {
  const div = $('#help-popup');
  div.classList.remove('big');
  const contents = $('.contents', div);
  contents.textContent = '';
  if (body) {
    contents.appendChild(typeof body === 'string' ? tHTML(body) : body);
  }
  $('.title', div).textContent = title;

  if (getComputedStyle(div).display === 'none') {
    window.addEventListener('keydown', closeHelp, true);
    // avoid chaining on multiple showHelp() calls
    $('.dismiss', div).onclick = closeHelp;
  }
  // reset any inline styles
  div.style = 'display: block';
  return div;

  function closeHelp(e) {
    if (!e || e.type === 'click' ||
        (e.which === 27 && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey &&
          !$('.CodeMirror-hints, #message-box') && !(document.activeElement instanceof HTMLInputElement))) {
      if (e && div.codebox && !div.codebox.options.readOnly && !div.codebox.isClean()) {
        messageBox.confirm(t('confirmDiscardChanges')).then(ok => ok && closeHelp());
        return;
      }
      div.style.display = '';
      contents.textContent = '';
      clearTimeout(contents.timer);
      window.removeEventListener('keydown', closeHelp, true);
      window.dispatchEvent(new Event('closeHelp'));
      (editors.lastActive || editors[0]).focus();
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

chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(request) {
  switch (request.method) {
    case 'styleUpdated':
      if (styleId && styleId === request.style.id &&
          request.reason !== 'editSave' &&
          request.reason !== 'config') {
        // code-less style from notifyAllTabs
        if ((request.style.sections[0] || {}).code === null) {
          request.style = BG.cachedStyles.byId.get(request.style.id);
        }
        if (isUsercss(request.style)) {
          editor.replaceStyle(request.style, request.codeIsUpdated);
        } else {
          initWithSectionStyle(request);
        }
      }
      break;
    case 'styleDeleted':
      if (styleId === request.id || editor && editor.getStyle().id === request.id) {
        window.onbeforeunload = () => {};
        closeCurrentTab();
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
  } else {
    $.remove(progressElement);
  }
}
