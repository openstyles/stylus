/* global CodeMirror onDOMready prefs setupLivePrefs $ $$ $create t tHTML
  createSourceEditor sessionStorageHash getOwnTab FIREFOX API tryCatch
  closeCurrentTab messageBox debounce tryJSONparse
  initBeautifyButton ignoreChromeError dirtyReporter linter
  moveFocus msg createSectionsEditor rerouteHotkeys CODEMIRROR_THEMES */
/* exported showCodeMirrorPopup editorWorker toggleContextMenuDelete */
'use strict';

// direct & reverse mapping of @-moz-document keywords and internal property names
const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
const CssToProperty = Object.entries(propertyToCss)
  .reduce((o, v) => {
    o[v[1]] = v[0];
    return o;
  }, {});

let editor;
let isWindowed;
let scrollPointTimer;

window.addEventListener('beforeunload', beforeUnload);
msg.onExtension(onRuntimeMessage);

lazyInit();

(async function init() {
  const [style] = await Promise.all([
    initStyleData(),
    onDOMready(),
    prefs.initializing.then(() => new Promise(resolve => {
      const theme = prefs.get('editor.theme');
      const el = $('#cm-theme');
      if (theme === 'default') {
        resolve();
      } else {
        // preload the theme so CodeMirror can use the correct metrics
        el.href = `vendor/codemirror/theme/${theme}.css`;
        el.addEventListener('load', resolve, {once: true});
      }
    })),
  ]);
  const usercss = isUsercss(style);
  const dirty = dirtyReporter();
  let wasDirty = false;
  let nameTarget;

  prefs.subscribe(['editor.linter'], updateLinter);
  prefs.subscribe(['editor.keyMap'], showHotkeyInTooltip);
  addEventListener('showHotkeyInTooltip', showHotkeyInTooltip);
  showHotkeyInTooltip();
  buildThemeElement();
  buildKeymapElement();
  setupLivePrefs();
  initNameArea();
  initBeautifyButton($('#beautify'), () => editor.getEditors());
  initResizeListener();
  detectLayout();
  updateTitle();

  $('#heading').textContent = t(style.id ? 'editStyleHeading' : 'addStyleTitle');
  $('#preview-label').classList.toggle('hidden', !style.id);

  editor = (usercss ? createSourceEditor : createSectionsEditor)({
    style,
    dirty,
    updateName,
    toggleStyle,
  });
  dirty.onChange(updateDirty);
  await editor.ready;

  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !usercss;
  $('#save-button').onclick = editor.save;

  function initNameArea() {
    const nameEl = $('#name');
    const resetEl = $('#reset-name');
    const isCustomName = style.updateUrl || usercss;
    nameTarget = isCustomName ? 'customName' : 'name';
    nameEl.placeholder = t(usercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
    nameEl.title = isCustomName ? t('customNameHint') : '';
    nameEl.addEventListener('input', () => {
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
    CODEMIRROR_THEMES.unshift(chrome.i18n.getMessage('defaultTheme'));
    $('#editor.theme').append(...CODEMIRROR_THEMES.map(s => $create('option', s)));
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

  function initResizeListener() {
    const {onBoundsChanged} = chrome.windows || {};
    if (onBoundsChanged) {
      // * movement is reported even if the window wasn't resized
      // * fired just once when done so debounce is not needed
      onBoundsChanged.addListener(wnd => {
        // getting the current window id as it may change if the user attached/detached the tab
        chrome.windows.getCurrent(ownWnd => {
          if (wnd.id === ownWnd.id) saveWindowPos();
        });
      });
    }
    window.addEventListener('resize', () => {
      if (!onBoundsChanged) debounce(saveWindowPos, 100);
      detectLayout();
    });
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
    updateTitle({});
  }

  function updateTitle() {
    document.title = `${dirty.isDirty() ? '* ' : ''}${style.customName || style.name}`;
  }

  function updateLinter(key, value) {
    $('body').classList.toggle('linter-disabled', value === '');
    linter.run();
  }
})();

/* Stuff not needed for the main init so we can let it run at its own tempo */
function lazyInit() {
  let ownTabId;
  getOwnTab().then(async tab => {
    ownTabId = tab.id;
    // use browser history back when 'back to manage' is clicked
    if (sessionStorageHash('manageStylesHistory').value[ownTabId] === location.href) {
      await onDOMready();
      $('#cancel-button').onclick = event => {
        event.stopPropagation();
        event.preventDefault();
        history.back();
      };
    }
  });
  // no windows on android
  if (!chrome.windows) {
    return;
  }
  // resize on 'undo close'
  const pos = tryJSONparse(sessionStorage.windowPos);
  delete sessionStorage.windowPos;
  if (pos && pos.left != null && chrome.windows) {
    chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
  }
  // detect isWindowed
  if (prefs.get('openEditInWindow') && history.length === 1) {
    chrome.tabs.query({currentWindow: true}, tabs => {
      if (tabs.length === 1) {
        chrome.windows.getAll(windows => {
          isWindowed = windows.length > 1; // not modifying the main browser window
        });
      }
    });
  }
  // toggle openEditInWindow
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
  sessionStorage.windowPos = JSON.stringify(canSaveWindowPos() && prefs.get('windowPosition'));
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

function isUsercss(style) {
  return (
    style.usercssData ||
    !style.id && prefs.get('newStyleAsUsercss')
  );
}

function initStyleData() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('id'));
  const createEmptyStyle = () => ({
    name: params.get('domain') ||
          tryCatch(() => new URL(params.get('url-prefix')).hostname) ||
          '',
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
  return fetchStyle()
    .then(style => {
      if (style.id) sessionStorage.justEditedStyleId = style.id;
      // we set "usercss" class on <html> when <body> is empty
      // so there'll be no flickering of the elements that depend on it
      if (isUsercss(style)) {
        document.documentElement.classList.add('usercss');
      }
      // strip URL parameters when invoked for a non-existent id
      if (!style.id) {
        history.replaceState({}, document.title, location.pathname);
      }
      return style;
    });

  function fetchStyle() {
    if (id) {
      return API.getStyle(id);
    }
    return Promise.resolve(createEmptyStyle());
  }
}

function showHelp(title = '', body) {
  const div = $('#help-popup');
  div.className = '';

  const contents = $('.contents', div);
  contents.textContent = '';
  if (body) {
    contents.appendChild(typeof body === 'string' ? tHTML(body) : body);
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
    window.removeEventListener('keydown', showHelp.close, true);
    window.dispatchEvent(new Event('closeHelp'));
  });

  window.addEventListener('keydown', showHelp.close, true);
  $('.dismiss', div).onclick = showHelp.close;

  // reset any inline styles
  div.style = 'display: block';

  showHelp.originalFocus = document.activeElement;
  return div;
}

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
    keyMap: prefs.get('editor.keyMap')
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
  window.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('closeHelp', () => {
    window.removeEventListener('keydown', onKeyDown, true);
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
  const scrollPoint = $('#header').clientHeight - 40;
  const linterEnabled = prefs.get('editor.linter') !== '';
  if (window.scrollY >= scrollPoint && !$('.fixed-header') && linterEnabled) {
    $('body').classList.add('fixed-header');
  } else if (window.scrollY < 40 && linterEnabled) {
    $('body').classList.remove('fixed-header');
  }
}

function detectLayout() {
  const body = $('body');
  const options = $('#options');
  const lint = $('#lint');
  const compact = window.innerWidth <= 850;
  const shortViewportLinter = window.innerHeight < 692;
  const shortViewportNoLinter = window.innerHeight < 554;
  const linterEnabled = prefs.get('editor.linter') !== '';
  if (compact) {
    body.classList.add('compact-layout');
    options.removeAttribute('open');
    options.classList.add('ignore-pref');
    lint.removeAttribute('open');
    lint.classList.add('ignore-pref');
    if (!$('.usercss')) {
      clearTimeout(scrollPointTimer);
      scrollPointTimer = setTimeout(() => {
        const scrollPoint = $('#header').clientHeight - 40;
        if (window.scrollY >= scrollPoint && !$('.fixed-header') && linterEnabled) {
          body.classList.add('fixed-header');
        }
      }, 250);
      window.addEventListener('scroll', fixedHeader, {passive: true});
    }
  } else {
    body.classList.remove('compact-layout');
    body.classList.remove('fixed-header');
    window.removeEventListener('scroll', fixedHeader);
    if (shortViewportLinter && linterEnabled || shortViewportNoLinter && !linterEnabled) {
      options.removeAttribute('open');
      options.classList.add('ignore-pref');
      if (prefs.get('editor.lint.expanded')) {
        lint.setAttribute('open', '');
      }
    } else {
      options.classList.remove('ignore-pref');
      lint.classList.remove('ignore-pref');
      if (prefs.get('editor.options.expanded')) {
        options.setAttribute('open', '');
      }
      if (prefs.get('editor.lint.expanded')) {
        lint.setAttribute('open', '');
      }
    }
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
