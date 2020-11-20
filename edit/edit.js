/* global
  $
  $$
  $create
  API
  clipString
  closeCurrentTab
  CodeMirror
  CODEMIRROR_THEMES
  debounce
  deepEqual
  DirtyReporter
  DocFuncMapper
  FIREFOX
  getOwnTab
  initBeautifyButton
  linter
  messageBox
  moveFocus
  msg
  onDOMready
  prefs
  rerouteHotkeys
  SectionsEditor
  sessionStore
  setupLivePrefs
  SourceEditor
  t
  tryCatch
  tryJSONparse
*/
'use strict';

/** @type {EditorBase|SourceEditor|SectionsEditor} */
const editor = {
  isUsercss: false,
  previewDelay: 200, // Chrome devtools uses 200
};
let isWindowed;
let headerHeight;

window.on('beforeunload', beforeUnload);
msg.onExtension(onRuntimeMessage);

lazyInit();

(async function init() {
  let style;
  let nameTarget;
  let wasDirty = false;
  const dirty = new DirtyReporter();
  await Promise.all([
    initStyle(),
    prefs.initializing
      .then(initTheme),
    onDOMready(),
  ]);
  const scrollInfo = style.id && tryJSONparse(sessionStore['editorScrollInfo' + style.id]);
  /** @namespace EditorBase */
  Object.assign(editor, {
    style,
    dirty,
    scrollInfo,
    updateName,
    updateToc,
    toggleStyle,
    applyScrollInfo(cm, si = ((scrollInfo || {}).cms || [])[0]) {
      if (si && si.sel) {
        cm.operation(() => {
          cm.setSelections(...si.sel, {scroll: false});
          cm.scrollIntoView(cm.getCursor(), si.parentHeight / 2);
        });
      }
    },
  });
  prefs.subscribe('editor.linter', updateLinter);
  prefs.subscribe('editor.keyMap', showHotkeyInTooltip);
  window.on('showHotkeyInTooltip', showHotkeyInTooltip);
  showHotkeyInTooltip();
  buildThemeElement();
  buildKeymapElement();
  setupLivePrefs();
  initNameArea();
  initBeautifyButton($('#beautify'), () => editor.getEditors());
  initResizeListener();
  detectLayout();

  $('#heading').textContent = t(style.id ? 'editStyleHeading' : 'addStyleTitle');
  $('#preview-label').classList.toggle('hidden', !style.id);
  const toc = [];
  const elToc = $('#toc');
  elToc.onclick = e => editor.jumpToEditor([...elToc.children].indexOf(e.target));
  if (editor.isUsercss) {
    SourceEditor();
  } else {
    SectionsEditor();
  }
  prefs.subscribe('editor.toc.expanded', (k, val) => val && editor.updateToc(), {now: true});
  dirty.onChange(updateDirty);

  await editor.ready;
  editor.ready = true;

  setTimeout(() => editor.getEditors().forEach(linter.enableForEditor));
  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !editor.isUsercss;
  $('#save-button').onclick = editor.save;

  async function initStyle() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('id'));
    style = id ? await API.getStyle(id) : initEmptyStyle(params);
    // switching the mode here to show the correct page ASAP, usually before DOMContentLoaded
    editor.isUsercss = Boolean(style.usercssData || !style.id && prefs.get('newStyleAsUsercss'));
    document.documentElement.classList.toggle('usercss', editor.isUsercss);
    sessionStore.justEditedStyleId = style.id || '';
    // no such style so let's clear the invalid URL parameters
    if (!style.id) history.replaceState({}, '', location.pathname);
    updateTitle(false);
  }

  function initEmptyStyle(params) {
    return {
      name: params.get('domain') ||
        tryCatch(() => new URL(params.get('url-prefix')).hostname) ||
        '',
      enabled: true,
      sections: [
        DocFuncMapper.toSection([...params], {code: ''}),
      ],
    };
  }

  function initNameArea() {
    const nameEl = $('#name');
    const resetEl = $('#reset-name');
    const isCustomName = style.updateUrl || editor.isUsercss;
    nameTarget = isCustomName ? 'customName' : 'name';
    nameEl.placeholder = t(editor.isUsercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
    nameEl.title = isCustomName ? t('customNameHint') : '';
    nameEl.on('input', () => {
      updateName(true);
      resetEl.hidden = false;
    });
    resetEl.hidden = !style.customName;
    resetEl.onclick = () => {
      const style = editor.style;
      nameEl.focus();
      nameEl.select();
      // trying to make it undoable via Ctrl-Z
      if (!document.execCommand('insertText', false, style.name)) {
        nameEl.value = style.name;
        updateName(true);
      }
      style.customName = null; // to delete it from db
      resetEl.hidden = true;
    };
    const enabledEl = $('#enabled');
    enabledEl.onchange = () => updateEnabledness(enabledEl.checked);
  }

  function initResizeListener() {
    const {onBoundsChanged} = chrome.windows || {};
    if (onBoundsChanged) {
      // * movement is reported even if the window wasn't resized
      // * fired just once when done so debounce is not needed
      onBoundsChanged.addListener(async wnd => {
        // getting the current window id as it may change if the user attached/detached the tab
        const {id} = await browser.windows.getCurrent();
        if (id === wnd.id) saveWindowPos();
      });
    }
    window.on('resize', () => {
      if (!onBoundsChanged) debounce(saveWindowPos, 100);
      detectLayout();
    });
  }

  function initTheme() {
    return new Promise(resolve => {
      const theme = prefs.get('editor.theme');
      const el = $('#cm-theme');
      if (theme === 'default') {
        resolve();
      } else {
        // preload the theme so CodeMirror can use the correct metrics
        el.href = `vendor/codemirror/theme/${theme}.css`;
        el.on('load', resolve, {once: true});
        el.on('error', () => {
          prefs.set('editor.theme', 'default');
          resolve();
        }, {once: true});
      }
    });
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

  function buildThemeElement() {
    const elOptions = [chrome.i18n.getMessage('defaultTheme'), ...CODEMIRROR_THEMES]
      .map(s => $create('option', s));
    elOptions[0].value = 'default';
    $('#editor.theme').append(...elOptions);
    // move the theme after built-in CSS so that its same-specificity selectors win
    document.head.appendChild($('#cm-theme'));
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

  function toggleStyle() {
    $('#enabled').checked = !style.enabled;
    updateEnabledness(!style.enabled);
  }

  function updateDirty() {
    const isDirty = dirty.isDirty();
    if (wasDirty !== isDirty) {
      wasDirty = isDirty;
      document.body.classList.toggle('dirty', isDirty);
      $('#save-button').disabled = !isDirty;
    }
    updateTitle();
  }

  function updateEnabledness(enabled) {
    dirty.modify('enabled', style.enabled, enabled);
    style.enabled = enabled;
    editor.updateLivePreview();
  }

  function updateName(isUserInput) {
    if (!editor) return;
    if (isUserInput) {
      const {value} = $('#name');
      dirty.modify('name', style[nameTarget] || style.name, value);
      style[nameTarget] = value;
    }
    updateTitle();
  }

  function updateTitle(isDirty = dirty.isDirty()) {
    document.title = `${isDirty ? '* ' : ''}${style.customName || style.name}`;
  }

  function updateLinter(key, value) {
    $('body').classList.toggle('linter-disabled', value === '');
    linter.run();
  }

  function updateToc(added = editor.sections) {
    const {sections} = editor;
    const first = sections.indexOf(added[0]);
    const elFirst = elToc.children[first];
    if (first >= 0 && (!added.focus || !elFirst)) {
      for (let el = elFirst, i = first; i < sections.length; i++) {
        const entry = sections[i].tocEntry;
        if (!deepEqual(entry, toc[i])) {
          if (!el) el = elToc.appendChild($create('li', {tabIndex: 0}));
          el.tabIndex = entry.removed ? -1 : 0;
          toc[i] = Object.assign({}, entry);
          const s = el.textContent = clipString(entry.label) || (
            entry.target == null
              ? t('appliesToEverything')
              : clipString(entry.target) + (entry.numTargets > 1 ? ', ...' : ''));
          if (s.length > 30) el.title = s;
        }
        el = el.nextElementSibling;
      }
    }
    while (toc.length > sections.length) {
      elToc.lastElementChild.remove();
      toc.length--;
    }
    if (added.focus) {
      const cls = 'current';
      const old = $('.' + cls, elToc);
      const el = elFirst || elToc.children[first];
      if (old && old !== el) old.classList.remove(cls);
      el.classList.add(cls);
    }
  }
})();

/* Stuff not needed for the main init so we can let it run at its own tempo */
function lazyInit() {
  let ownTabId;
  // not using `await` so we don't block the subsequent code
  getOwnTab().then(patchHistoryBack);
  // no windows on android
  if (chrome.windows) {
    restoreWindowSize();
    detectWindowedState();
    chrome.tabs.onAttached.addListener(onAttached);
  }
  async function patchHistoryBack(tab) {
    ownTabId = tab.id;
    // use browser history back when 'back to manage' is clicked
    if (sessionStore['manageStylesHistory' + ownTabId] === location.href) {
      await onDOMready();
      $('#cancel-button').onclick = event => {
        event.stopPropagation();
        event.preventDefault();
        history.back();
      };
    }
  }
  /** resize on 'undo close' */
  function restoreWindowSize() {
    const pos = tryJSONparse(sessionStore.windowPos);
    delete sessionStore.windowPos;
    if (pos && pos.left != null && chrome.windows) {
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
    }
  }
  async function detectWindowedState() {
    isWindowed =
      prefs.get('openEditInWindow') &&
      history.length === 1 &&
      browser.windows.getAll().length > 1 &&
      (await browser.tabs.query({currentWindow: true})).length === 1;
  }
  async function onAttached(tabId, info) {
    if (tabId !== ownTabId) {
      return;
    }
    if (info.newPosition !== 0) {
      prefs.set('openEditInWindow', false);
      return;
    }
    const win = await browser.windows.get(info.newWindowId, {populate: true});
    // If there's only one tab in this window, it's been dragged to new window
    const openEditInWindow = win.tabs.length === 1;
    // FF-only because Chrome retardedly resets the size during dragging
    if (openEditInWindow && FIREFOX) {
      chrome.windows.update(info.newWindowId, prefs.get('windowPosition'));
    }
    prefs.set('openEditInWindow', openEditInWindow);
  }
}

function onRuntimeMessage(request) {
  switch (request.method) {
    case 'styleUpdated':
      if (
        editor.style.id === request.style.id &&
        !['editPreview', 'editPreviewEnd', 'editSave', 'config']
          .includes(request.reason)
      ) {
        Promise.resolve(
          request.codeIsUpdated === false ?
            request.style : API.getStyle(request.style.id)
        )
          .then(newStyle => {
            editor.replaceStyle(newStyle, request.codeIsUpdated);
          });
      }
      break;
    case 'styleDeleted':
      if (editor.style.id === request.style.id) {
        closeCurrentTab();
        break;
      }
      break;
    case 'editDeleteText':
      document.execCommand('delete');
      break;
  }
}

function beforeUnload(e) {
  sessionStore.windowPos = JSON.stringify(canSaveWindowPos() && prefs.get('windowPosition'));
  sessionStore['editorScrollInfo' + editor.style.id] = JSON.stringify({
    scrollY: window.scrollY,
    cms: editor.getEditors().map(cm => /** @namespace EditorScrollInfo */({
      focus: cm.hasFocus(),
      height: cm.display.wrapper.style.height.replace('100vh', ''),
      parentHeight: cm.display.wrapper.parentElement.offsetHeight,
      sel: cm.isClean() && [cm.doc.sel.ranges, cm.doc.sel.primIndex],
    })),
  });
  const activeElement = document.activeElement;
  if (activeElement) {
    // blurring triggers 'change' or 'input' event if needed
    activeElement.blur();
    // refocus if unloading was canceled
    setTimeout(() => activeElement.focus());
  }
  if (editor && editor.dirty.isDirty()) {
    // neither confirm() nor custom messages work in modern browsers but just in case
    e.returnValue = t('styleChangesNotSaved');
  }
}

function showHelp(title = '', body) {
  const div = $('#help-popup');
  div.className = '';

  const contents = $('.contents', div);
  contents.textContent = '';
  if (body) {
    contents.appendChild(typeof body === 'string' ? t.HTML(body) : body);
  }

  $('.title', div).textContent = title;

  showHelp.close = showHelp.close || (event => {
    const canClose =
      !event ||
      event.type === 'click' ||
      (
        event.key === 'Escape' &&
        !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey &&
        !$('.CodeMirror-hints, #message-box') &&
        (
          !document.activeElement ||
          !document.activeElement.closest('#search-replace-dialog') &&
          document.activeElement.matches(':not(input), .can-close-on-esc')
        )
      );
    if (!canClose) {
      return;
    }
    if (event && div.codebox && !div.codebox.options.readOnly && !div.codebox.isClean()) {
      setTimeout(() => {
        messageBox.confirm(t('confirmDiscardChanges'))
          .then(ok => ok && showHelp.close());
      });
      return;
    }
    if (div.contains(document.activeElement) && showHelp.originalFocus) {
      showHelp.originalFocus.focus();
    }
    div.style.display = '';
    contents.textContent = '';
    clearTimeout(contents.timer);
    window.off('keydown', showHelp.close, true);
    window.dispatchEvent(new Event('closeHelp'));
  });

  window.on('keydown', showHelp.close, true);
  $('.dismiss', div).onclick = showHelp.close;

  // reset any inline styles
  div.style = 'display: block';

  showHelp.originalFocus = document.activeElement;
  return div;
}

/* exported showCodeMirrorPopup */
function showCodeMirrorPopup(title, html, options) {
  const popup = showHelp(title, html);
  popup.classList.add('big');

  let cm = popup.codebox = CodeMirror($('.contents', popup), Object.assign({
    mode: 'css',
    lineNumbers: true,
    lineWrapping: prefs.get('editor.lineWrapping'),
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    matchBrackets: true,
    styleActiveLine: true,
    theme: prefs.get('editor.theme'),
    keyMap: prefs.get('editor.keyMap'),
  }, options));
  cm.focus();
  rerouteHotkeys(false);

  document.documentElement.style.pointerEvents = 'none';
  popup.style.pointerEvents = 'auto';

  const onKeyDown = event => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const search = $('#search-replace-dialog');
      const area = search && search.contains(document.activeElement) ? search : popup;
      moveFocus(area, event.shiftKey ? -1 : 1);
      event.preventDefault();
    }
  };
  window.on('keydown', onKeyDown, true);

  window.on('closeHelp', () => {
    window.off('keydown', onKeyDown, true);
    document.documentElement.style.removeProperty('pointer-events');
    rerouteHotkeys(true);
    cm = popup.codebox = null;
  }, {once: true});

  return popup;
}

function canSaveWindowPos() {
  return isWindowed &&
    document.visibilityState === 'visible' &&
    prefs.get('openEditInWindow') &&
    !isWindowMaximized();
}

function saveWindowPos() {
  if (canSaveWindowPos()) {
    prefs.set('windowPosition', {
      left: window.screenX,
      top: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    });
  }
}

function fixedHeader() {
  const headerFixed = $('.fixed-header');
  if (!headerFixed) headerHeight = $('#header').clientHeight;
  const scrollPoint = headerHeight - 43;
  if (window.scrollY >= scrollPoint && !headerFixed) {
    $('body').style.setProperty('--fixed-padding', ` ${headerHeight}px`);
    $('body').classList.add('fixed-header');
  } else if (window.scrollY < scrollPoint && headerFixed) {
    $('body').classList.remove('fixed-header');
  }
}

function detectLayout() {
  const compact = window.innerWidth <= 850;
  if (compact) {
    document.body.classList.add('compact-layout');
    if (!editor.isUsercss) {
      debounce(fixedHeader, 250);
      window.on('scroll', fixedHeader, {passive: true});
    }
  } else {
    document.body.classList.remove('compact-layout', 'fixed-header');
    window.off('scroll', fixedHeader);
  }
  for (const type of ['options', 'toc', 'lint']) {
    const el = $(`details[data-pref="editor.${type}.expanded"]`);
    el.open = compact ? false : prefs.get(el.dataset.pref);
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
