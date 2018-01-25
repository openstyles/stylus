/*
global CodeMirror parserlib loadScript
global CSSLint initLint linterConfig updateLintReport renderLintReport updateLinter
global createSourceEditor
global closeCurrentTab regExpTester messageBox
global setupCodeMirror
global beautify
global initWithSectionStyle addSections removeSection getSectionsHashes
global sectionsToMozFormat
global exclusions
*/
'use strict';

let styleId = null;
// only the actually dirty items here
let dirty = {};
// array of all CodeMirror instances
const editors = [];
let saveSizeOnClose;
let ownTabId;

// direct & reverse mapping of @-moz-document keywords and internal property names
const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
const CssToProperty = {'url': 'urls', 'url-prefix': 'urlPrefixes', 'domain': 'domains', 'regexp': 'regexps'};

let editor;

window.onbeforeunload = beforeUnload;
chrome.runtime.onMessage.addListener(onRuntimeMessage);

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

  $('#beautify').onclick = beautify;
  $('#lint').addEventListener('scroll', hideLintHeaderOnScroll, {passive: true});
  window.addEventListener('resize', () => debounce(rememberWindowSize, 100));

  exclusions.init(style);
  if (usercss) {
    editor = createSourceEditor(style);
  } else {
    initWithSectionStyle(style);
    document.addEventListener('wheel', scrollEntirePageOnCtrlShift);
  }
});

function preinit() {
  // make querySelectorAll enumeration code readable
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
          ? API.getStyles({id})
          : Promise.resolve([request.style])
        ).then(([style]) => {
          if (isUsercss(style)) {
            editor.replaceStyle(style, request.codeIsUpdated);
          } else {
            initWithSectionStyle(style, request.codeIsUpdated);
          }
        });
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

function beforeUnload() {
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
  const id = params.get('id');
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
  return API.getStyles({id: id || -1})
    .then(([style = createEmptyStyle()]) => {
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
  $('#to-mozilla').addEventListener('click', showMozillaFormat, false);
  $('#to-mozilla-help').addEventListener('click', showToMozillaHelp, false);
  $('#from-mozilla').addEventListener('click', fromMozillaFormat);
  $('#save-button').addEventListener('click', save, false);
  $('#sections-help').addEventListener('click', showSectionHelp, false);

  // TODO: investigate why FF needs this delay
  debounce(initLint, FIREFOX ? 100 : 0);

  if (!FIREFOX) {
    $$([
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="number"]',
    ].join(','))
      .forEach(e => e.addEventListener('mousedown', toggleContextMenuDelete));
  }
}

function getNodeValue(node) {
  // return length of exclusions; or the node value
  return node.id === 'excluded-list' ? node.children.length.toString() : node.value;
}

function onChange(event) {
  const node = event.target;
  if ('savedValue' in node) {
    const currentValue = node.type === 'checkbox' ? node.checked : getNodeValue(node);
    setCleanItem(node, node.savedValue === currentValue);
  } else {
    // the manually added section's applies-to is dirty only when the value is non-empty
    setCleanItem(node, node.localName !== 'input' || !getNodeValue(node).trim());
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
      node.savedValue = node.type === 'checkbox' ? node.checked : getNodeValue(node);
    }
  } else {
    dirty[node.id] = true;
  }

  setDirtyClass(node, !isClean);
}

function isCleanGlobal() {
  const clean = Object.keys(dirty).length === 0;
  setDirtyClass(document.body, !clean);
  return clean;
}

function setCleanGlobal() {
  setCleanItem($('#sections'), true);
  $$('#header, #sections > div').forEach(setCleanSection);
  // forget the dirty applies-to ids from a deleted section after the style was saved
  dirty = {};
}

function setCleanSection(section) {
  $$('.style-contributor', section).forEach(node => setCleanItem(node, true));
  setCleanItem(section, true);
  updateTitle();
}

function toggleStyle() {
  $('#enabled').dispatchEvent(new MouseEvent('click', {bubbles: true}));
}

function save() {
  updateLintReportIfEnabled(null, 0);
  if (!validate()) {
    return;
  }

  API.saveStyle({
    id: styleId,
    name: $('#name').value.trim(),
    enabled: $('#enabled').checked,
    reason: 'editSave',
    sections: getSectionsHashes(),
    exclusions: exclusions.get()
  })
  .then(style => {
    styleId = style.id;
    sessionStorage.justEditedStyleId = styleId;
    setCleanGlobal();
    // Go from new style URL to edit style URL
    if (location.href.indexOf('id=') === -1) {
      history.replaceState({}, document.title, 'edit.html?id=' + style.id);
      $('#heading').textContent = t('editStyleHeading');
    }
    updateTitle();
    $('#preview-label').classList.remove('hidden');
  });
}

function validate() {
  const name = $('#name').value.trim();
  if (!name) {
    $('#name').focus();
    messageBox.alert(t('styleMissingName'));
    return false;
  }

  if ($$('.applies-to-list li:not(.applies-to-everything)')
    .some(li => {
      const type = $('[name=applies-type]', li).value;
      const value = $('[name=applies-value]', li);
      const rx = value.value.trim();
      if (type === 'regexp' && rx && !tryRegExp(rx)) {
        value.focus();
        value.select();
        return true;
      }
    })) {
    messageBox.alert(t('styleBadRegexp'));
    return false;
  }

  return true;
}

function updateTitle() {
  const DIRTY_TITLE = '* $';
  const name = $('#name').savedValue;
  const clean = isCleanGlobal();
  const title = styleId === null ? t('addStyleTitle') : t('editStyleTitle', [name]);
  document.title = clean ? title : DIRTY_TITLE.replace('$', title);
  $('#save-button').disabled = clean;
}

function updateLintReportIfEnabled(...args) {
  if (CodeMirror.defaults.lint) {
    updateLintReport(...args);
  }
}

function showMozillaFormat() {
  const popup = showCodeMirrorPopup(t('styleToMozillaFormatTitle'), '', {readOnly: true});
  popup.codebox.setValue(toMozillaFormat());
  popup.codebox.execCommand('selectAll');
}

function toMozillaFormat() {
  return sectionsToMozFormat({sections: getSectionsHashes()});
}

function fromMozillaFormat() {
  const popup = showCodeMirrorPopup(t('styleFromMozillaFormatPrompt'),
    $create([
      $create('button', {
        name: 'import-append',
        textContent: t('importAppendLabel'),
        title: 'Ctrl-Enter:\n' + t('importAppendTooltip'),
        onclick: doImport,
      }),
      $create('button', {
        name: 'import-replace',
        textContent: t('importReplaceLabel'),
        title: 'Ctrl-Shift-Enter:\n' + t('importReplaceTooltip'),
        onclick: () => doImport({replaceOldStyle: true}),
      }),
    ]));
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
      .then(() => {
        const worker = linterConfig.worker.csslint;
        if (!worker.instance) worker.instance = new Worker(worker.path);
      })
      .then(() => linterConfig.invokeWorker({
        linter: 'csslint',
        action: 'parse',
        code: popup.codebox.getValue().trim(),
      }))
      .then(({sections, errors}) => {
        // shouldn't happen but just in case
        if (!sections.length && errors.length) {
          return Promise.reject(errors);
        }
        // show the errors in case linting is disabled or stylelint misses what csslint has found
        if (errors.length && prefs.get('editor.linter') !== 'csslint') {
          showError(errors);
        }
        removeOldSections(replaceOldStyle);
        return addSections(sections, div => setCleanItem(div, false));
      })
      .then(sectionDivs => {
        sectionDivs.forEach(div => updateLintReportIfEnabled(div.CodeMirror, 1));
        $('.dismiss').dispatchEvent(new Event('click'));
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
    if (popup.codebox) {
      popup.classList.toggle('ready', locked ? false : !popup.codebox.isBlank());
      popup.codebox.options.readOnly = locked;
      popup.codebox.display.wrapper.style.opacity = locked ? '.5' : '';
    }
  }

  function showError(errors) {
    messageBox({
      className: 'center danger',
      title: t('styleFromMozillaFormatError'),
      contents: $create('pre', Array.isArray(errors) ? errors.join('\n') : errors),
      buttons: [t('confirmClose')],
    });
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

  if (getComputedStyle(div).display === 'none') {
    window.addEventListener('keydown', showHelp.close, true);
    $('.dismiss', div).onclick = showHelp.close;
  }

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
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    matchBrackets: true,
    lint: linterConfig.getForCodeMirror(),
    styleActiveLine: true,
    theme: prefs.get('editor.theme'),
    keyMap: prefs.get('editor.keyMap')
  }, options));
  cm.focus();
  const rerouteOn = () => cm.rerouteHotkeys(false);
  const rerouteOff = () => cm.rerouteHotkeys(true);
  cm.on('focus', rerouteOn);
  cm.on('blur', rerouteOff);
  window.addEventListener('closeHelp', function _() {
    window.removeEventListener('closeHelp', _);
    cm.off('focus', rerouteOn);
    cm.off('blur', rerouteOff);
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

function scrollEntirePageOnCtrlShift(event) {
  // make Shift-Ctrl-Wheel scroll entire page even when mouse is over a code editor
  if (event.shiftKey && event.ctrlKey && !event.altKey && !event.metaKey) {
    // Chrome scrolls horizontally when Shift is pressed but on some PCs this might be different
    window.scrollBy(0, event.deltaX || event.deltaY);
    event.preventDefault();
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
