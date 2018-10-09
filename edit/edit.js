/*
global CodeMirror loadScript
global createSourceEditor
global closeCurrentTab regExpTester messageBox
global setupCodeMirror
global beautify
global initWithSectionStyle addSections removeSection getSectionsHashes
global sectionsToMozFormat
global exclusions
global moveFocus editorWorker msg
*/
'use strict';

let saveSizeOnClose;
let ownTabId;

// direct & reverse mapping of @-moz-document keywords and internal property names
const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
const CssToProperty = Object.entries(propertyToCss)
  .reduce((o, v) => {
    o[v[1]] = v[0];
    return o;
  }, {});

let editor;

document.addEventListener('visibilitychange', beforeUnload);
msg.onExtension(onRuntimeMessage);

preinit();

Promise.all([
  initStyleData(),
  onDOMready(),
])
.then(([style]) => {
  const usercss = isUsercss(style);
  $('#heading').textContent = t(styleId ? 'editStyleHeading' : 'addStyleTitle');
  $('#name').placeholder = t(usercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
  $('#name').title = usercss ? t('usercssReplaceTemplateName') : '';

  $('#preview-label').classList.toggle('hidden', !styleId);

  $('#beautify').onclick = () => beautify(editor.getEditors());
  $('#lint').addEventListener('scroll', hideLintHeaderOnScroll, {passive: true});
  window.addEventListener('resize', () => debounce(rememberWindowSize, 100));

  exclusions.init(style);
  editor = usercss ? createSourceEditor(style) : createSectionEditor(style);
});

function preinit() {
  // make querySelectorAll enumeration code readable
  // FIXME: don't extend native
  ['forEach', 'some', 'indexOf', 'map'].forEach(method => {
    NodeList.prototype[method] = Array.prototype[method];
  });

  // eslint-disable-next-line no-extend-native
  Object.defineProperties(Array.prototype, {
    last: {
      get() {
        return this[this.length - 1];
      },
    },
    rotate: {
      value: function (amount) {
        // negative amount == rotate left
        const r = this.slice(-amount, this.length);
        Array.prototype.push.apply(r, this.slice(0, this.length - r.length));
        return r;
      },
    },
  });

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
    ownTabId = tab.id;

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
      if (styleId && styleId === request.style.id &&
          request.reason !== 'editPreview' &&
          request.reason !== 'editSave' &&
          request.reason !== 'config') {
        // code-less style from notifyAllTabs
        const {sections, id} = request.style;
        ((sections && sections[0] || {}).code === null
          ? API.getStyleFromDB(id)
          : Promise.resolve([request.style])
        ).then(([style]) => {
          editor.replaceStyle(style, request.codeIsUpdated);
        });
      }
      break;
    case 'styleDeleted':
      if (styleId === request.id || editor && editor.getStyle().id === request.id) {
        document.removeEventListener('visibilitychange', beforeUnload);
        window.onbeforeunload = null;
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

/**
 * Invoked for 'visibilitychange' event by default.
 * Invoked for 'beforeunload' event when the style is modified and unsaved.
 * See https://developers.google.com/web/updates/2018/07/page-lifecycle-api#legacy-lifecycle-apis-to-avoid
 *   > Never add a beforeunload listener unconditionally or use it as an end-of-session signal.
 *   > Only add it when a user has unsaved work, and remove it as soon as that work has been saved.
 */
function beforeUnload() {
  if (saveSizeOnClose) rememberWindowSize();
  const activeElement = document.activeElement;
  if (activeElement) {
    // blurring triggers 'change' or 'input' event if needed
    activeElement.blur();
    // refocus if unloading was canceled
    setTimeout(() => activeElement.focus());
  }
  if (editor.isDirty()) {
    // neither confirm() nor custom messages work in modern browsers but just in case
    return t('styleChangesNotSaved');
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
    id: null,
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
      styleId = style.id;
      if (styleId) sessionStorage.justEditedStyleId = styleId;
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
    });

  function fetchStyle() {
    if (id) {
      return API.getStyleFromDB(id);
    }
    return Promise.resolve(createEmptyStyle());
  }
}

function showSectionHelp(event) {
  event.preventDefault();
  showHelp(t('styleSectionsTitle'), t('sectionHelp'));
}

function showAppliesToHelp(event) {
  event.preventDefault();
  showHelp(t('appliesLabel'), t('appliesHelp'));
}

function showToMozillaHelp(event) {
  event.preventDefault();
  showHelp(t('styleMozillaFormatHeading'), t('styleToMozillaFormatHelp'));
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
  cm.rerouteHotkeys(false);

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
    cm.rerouteHotkeys(true);
    cm = popup.codebox = null;
  });

  return popup;
}

function setGlobalProgress(done, total) {
  const progressElement = $('#global-progress') ||
    total && document.body.appendChild($create('#global-progress'));
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

function hideLintHeaderOnScroll() {
  // workaround part2 for the <details> not showing its toggle icon: hide <summary> on scroll
  const newOpacity = this.scrollTop === 0 ? '' : '0';
  const style = this.firstElementChild.style;
  if (style.opacity !== newOpacity) {
    style.opacity = newOpacity;
  }
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
