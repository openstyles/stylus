/* global CodeMirror onDOMready prefs setupLivePrefs $ $$ $create t tHTML
  createSourceEditor queryTabs sessionStorageHash getOwnTab FIREFOX API tryCatch
  closeCurrentTab messageBox debounce workerUtil
  beautify ignoreChromeError
  moveFocus msg createSectionsEditor rerouteHotkeys CODEMIRROR_THEMES */
/* exported showCodeMirrorPopup editorWorker toggleContextMenuDelete */
'use strict';

const editorWorker = workerUtil.createWorker({
  url: '/edit/editor-worker.js'
});

let saveSizeOnClose;

// direct & reverse mapping of @-moz-document keywords and internal property names
const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
const CssToProperty = Object.entries(propertyToCss)
  .reduce((o, v) => {
    o[v[1]] = v[0];
    return o;
  }, {});

let editor;

let scrollPointTimer;

document.addEventListener('visibilitychange', beforeUnload);
window.addEventListener('beforeunload', beforeUnload);
msg.onExtension(onRuntimeMessage);

preinit();

(() => {
  onDOMready().then(() => {
    prefs.subscribe(['editor.keyMap'], showHotkeyInTooltip);
    addEventListener('showHotkeyInTooltip', showHotkeyInTooltip);
    showHotkeyInTooltip();

    buildThemeElement();
    buildKeymapElement();

    setupLivePrefs();
  });

  initEditor();

  function getCodeMirrorThemes() {
    if (!chrome.runtime.getPackageDirectoryEntry) {
      const themes = [
        chrome.i18n.getMessage('defaultTheme'),
        ...CODEMIRROR_THEMES
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

  function initEditor() {
    return Promise.all([
      initStyleData(),
      onDOMready(),
      prefs.initializing,
    ])
      .then(([style]) => {
        const usercss = isUsercss(style);
        $('#heading').textContent = t(style.id ? 'editStyleHeading' : 'addStyleTitle');
        $('#name').placeholder = t(usercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
        $('#name').title = usercss ? t('usercssReplaceTemplateName') : '';

        $('#preview-label').classList.toggle('hidden', !style.id);

        $('#beautify').onclick = () => beautify(editor.getEditors());
        window.addEventListener('resize', () => {
          debounce(rememberWindowSize, 100);
          detectLayout();
        });
        detectLayout();
        editor = (usercss ? createSourceEditor : createSectionsEditor)({
          style,
          onTitleChanged: updateTitle
        });
        editor.dirty.onChange(updateDirty);
        return Promise.resolve(editor.ready && editor.ready())
          .then(updateDirty);
      });
  }

  function updateTitle() {
    if (editor) {
      const styleName = editor.getStyle().name;
      const isDirty = editor.dirty.isDirty();
      document.title = (isDirty ? '* ' : '') + styleName;
    }
  }

  function updateDirty() {
    const isDirty = editor.dirty.isDirty();
    document.body.classList.toggle('dirty', isDirty);
    $('#save-button').disabled = !isDirty;
    updateTitle();
  }
})();

function preinit() {
  // preload the theme so that CodeMirror can calculate its metrics in DOMContentLoaded->setupLivePrefs()
  new MutationObserver((mutations, observer) => {
    const themeElement = $('#cm-theme');
    if (themeElement) {
      themeElement.href = prefs.get('editor.theme') === 'default' ? ''
        : 'vendor/codemirror/theme/' + prefs.get('editor.theme') + '.css';
      observer.disconnect();
    }
  }).observe(document, {subtree: true, childList: true});

  if (chrome.windows) {
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
    });
  }

  getOwnTab().then(tab => {
    const ownTabId = tab.id;

    // use browser history back when 'back to manage' is clicked
    if (sessionStorageHash('manageStylesHistory').value[ownTabId] === location.href) {
      onDOMready().then(() => {
        $('#cancel-button').onclick = event => {
          event.stopPropagation();
          event.preventDefault();
          history.back();
        };
      });
    }
    // no windows on android
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
}

function onRuntimeMessage(request) {
  switch (request.method) {
    case 'styleUpdated':
      if (
        editor.getStyleId() === request.style.id &&
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
      if (editor.getStyleId() === request.style.id) {
        document.removeEventListener('visibilitychange', beforeUnload);
        document.removeEventListener('beforeunload', beforeUnload);
        closeCurrentTab();
        break;
      }
      break;
    case 'editDeleteText':
      document.execCommand('delete');
      break;
  }
}

/**
 * Invoked for 'visibilitychange' event by default.
 * Invoked for 'beforeunload' event when the style is modified and unsaved.
 * See https://developers.google.com/web/updates/2018/07/page-lifecycle-api#legacy-lifecycle-apis-to-avoid
 *   > Never add a beforeunload listener unconditionally or use it as an end-of-session signal.
 *   > Only add it when a user has unsaved work, and remove it as soon as that work has been saved.
 */
function beforeUnload(e) {
  if (saveSizeOnClose) rememberWindowSize();
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
  // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
  const params = new URLSearchParams(location.search.replace(/^\?/, ''));
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
        event.which === 27 &&
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
    if (event.which === 9 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const search = $('#search-replace-dialog');
      const area = search && search.contains(document.activeElement) ? search : popup;
      moveFocus(area, event.shiftKey ? -1 : 1);
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('closeHelp', function _() {
    window.removeEventListener('closeHelp', _);
    window.removeEventListener('keydown', onKeyDown, true);
    document.documentElement.style.removeProperty('pointer-events');
    rerouteHotkeys(true);
    cm = popup.codebox = null;
  });

  return popup;
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

prefs.subscribe(['editor.linter'], (key, value) => {
  $('body').classList.toggle('linter-disabled', value === '');
});

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
      window.addEventListener('scroll', fixedHeader);
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
