/* global $$ $ $create messageBoxProxy */// dom.js
/* global API msg */// msg.js
/* global CodeMirror */
/* global SectionsEditor */
/* global SourceEditor */
/* global baseInit */
/* global clipString createHotkeyInput helpPopup */// util.js
/* global closeCurrentTab deepEqual sessionStore tryJSONparse */// toolbox.js
/* global cmFactory */
/* global editor */
/* global linterMan */
/* global prefs */
/* global t */// localization.js
'use strict';

//#region init

document.body.appendChild(t.template.body);

EditorMethods();
editor.livePreview = LivePreview();
(editor.isUsercss ? SourceEditor : SectionsEditor)().then(() => {
  editor.dirty.onChange(editor.updateDirty);
  prefs.subscribe('editor.linter', () => linterMan.run());

  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !editor.isUsercss;
  $('#save-button').onclick = editor.save;
  $('#cancel-button').onclick = editor.cancel;

  const elSec = $('#sections-list');
  // editor.toc.expanded pref isn't saved in compact-layout so prefs.subscribe won't work
  if (elSec.open) editor.updateToc();
  // and we also toggle `open` directly in other places e.g. in detectLayout()
  new MutationObserver(() => elSec.open && editor.updateToc())
    .observe(elSec, {attributes: true, attributeFilter: ['open']});

  $('#toc').onclick = e =>
    editor.jumpToEditor([...$('#toc').children].indexOf(e.target));
  $('#keyMap-help').onclick = () =>
    require(['/edit/show-keymap-help'], () => showKeymapHelp()); /* global showKeymapHelp */
  $('#linter-settings').onclick = () =>
    require(['/edit/linter-dialogs'], () => linterMan.showLintConfig());
  $('#lint-help').onclick = () =>
    require(['/edit/linter-dialogs'], () => linterMan.showLintHelp());
  $('#style-settings-btn').onclick = () => require([
    '/edit/settings.css',
    '/edit/settings', /* global StyleSettings */
  ], () => StyleSettings());

  require([
    '/edit/autocomplete',
    '/edit/drafts',
    '/edit/global-search',
  ]);

  // Set up mini-header on scroll
  const {isUsercss} = editor;
  const el = $create({
    style: `
      top: 0;
      height: 1px;
      position: absolute;
      visibility: hidden;
    `.replace(/;/g, '!important;'),
  });
  const scroller = isUsercss ? $('.CodeMirror-scroll') : document.body;
  const xoRoot = isUsercss ? scroller : undefined;
  const xo = new IntersectionObserver(onScrolled, {root: xoRoot});
  scroller.appendChild(el);
  onCompactToggled(baseInit.mqCompact);
  baseInit.mqCompact.on('change', onCompactToggled);

  /** @param {MediaQueryList} mq */
  function onCompactToggled(mq) {
    for (const el of $$('details[data-pref]')) {
      el.open = mq.matches ? false : prefs.get(el.dataset.pref);
    }
    if (mq.matches) {
      xo.observe(el);
    } else {
      xo.disconnect();
    }
  }
  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    const h = $('#header');
    const sticky = !entries.pop().isIntersecting;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    h.classList.toggle('sticky', sticky);
  }
});

//#endregion
//#region events

msg.onExtension(request => {
  const {style} = request;
  switch (request.method) {
    case 'styleUpdated':
      if (editor.style.id === style.id) {
        handleExternalUpdate(request);
      }
      break;
    case 'styleDeleted':
      if (editor.style.id === style.id) {
        closeCurrentTab();
      }
      break;
  }
});

async function handleExternalUpdate({style, reason}) {
  if (reason === 'editPreview' ||
      reason === 'editPreviewEnd') {
    return;
  }
  if (reason === 'editSave' && editor.saving) {
    editor.saving = false;
    return;
  }
  if (reason === 'toggle') {
    if (editor.dirty.isDirty()) {
      editor.toggleStyle(style.enabled);
    } else {
      Object.assign(editor.style, style);
    }
    editor.updateMeta();
    editor.updateLivePreview();
    return;
  }
  style = await API.styles.get(style.id);
  if (reason === 'config') {
    delete style.sourceCode;
    delete style.sections;
    delete style.name;
    delete style.enabled;
    Object.assign(editor.style, style);
  } else {
    await editor.replaceStyle(style);
  }
  window.dispatchEvent(new Event('styleSettings'));
}

window.on('beforeunload', e => {
  let pos;
  if (editor.isWindowed &&
      document.visibilityState === 'visible' &&
      prefs.get('openEditInWindow') &&
      screenX !== -32000 && // Chrome uses this value for minimized windows
      ( // only if not maximized
        screenX > 0 || outerWidth < screen.availWidth ||
        screenY > 0 || outerHeight < screen.availHeight ||
        screenX <= -10 || outerWidth >= screen.availWidth + 10 ||
        screenY <= -10 || outerHeight >= screen.availHeight + 10
      )
  ) {
    pos = {
      left: screenX,
      top: screenY,
      width: outerWidth,
      height: outerHeight,
    };
    prefs.set('windowPosition', pos);
  }
  sessionStore.windowPos = JSON.stringify(pos || {});
  sessionStore['editorScrollInfo' + editor.style.id] = JSON.stringify(editor.makeScrollInfo());
  const activeElement = document.activeElement;
  if (activeElement) {
    // blurring triggers 'change' or 'input' event if needed
    activeElement.blur();
    // refocus if unloading was canceled
    setTimeout(() => activeElement.focus());
  }
  if (editor.dirty.isDirty()) {
    // neither confirm() nor custom messages work in modern browsers but just in case
    e.returnValue = t('styleChangesNotSaved');
  }
});

//#endregion
//#region editor methods

function EditorMethods() {
  const toc = [];
  const {dirty} = editor;
  let {style} = editor;
  let wasDirty = false;

  Object.defineProperties(editor, {
    scrollInfo: {
      get: () => style.id && tryJSONparse(sessionStore['editorScrollInfo' + style.id]) || {},
    },
    style: {
      get: () => style,
      set: val => (style = val),
    },
  });

  /** @namespace Editor */
  Object.assign(editor, {

    applyScrollInfo(cm, si = (editor.scrollInfo.cms || [])[0]) {
      if (si && si.sel) {
        const bmOpts = {sublimeBookmark: true, clearWhenEmpty: false}; // copied from sublime.js
        cm.operation(() => {
          cm.setSelections(...si.sel, {scroll: false});
          cm.scrollIntoView(cm.getCursor(), si.parentHeight / 2);
          cm.state.sublimeBookmarks = si.bookmarks.map(b => cm.markText(b.from, b.to, bmOpts));
        });
      }
    },

    makeScrollInfo() {
      return {
        scrollY: window.scrollY,
        cms: editor.getEditors().map(cm => /** @namespace EditorScrollInfo */({
          bookmarks: (cm.state.sublimeBookmarks || []).map(b => b.find()),
          focus: cm.hasFocus(),
          height: cm.display.wrapper.style.height.replace('100vh', ''),
          parentHeight: cm.display.wrapper.parentElement.offsetHeight,
          sel: [cm.doc.sel.ranges, cm.doc.sel.primIndex],
        })),
      };
    },

    async save() {
      if (dirty.isDirty()) {
        editor.saving = true;
        await editor.saveImpl();
      }
    },

    toggleStyle(enabled = !style.enabled) {
      $('#enabled').checked = enabled;
      editor.updateEnabledness(enabled);
    },

    updateDirty() {
      const isDirty = dirty.isDirty();
      if (wasDirty !== isDirty) {
        wasDirty = isDirty;
        document.body.classList.toggle('dirty', isDirty);
        $('#save-button').disabled = !isDirty;
      }
      editor.updateTitle();
    },

    updateEnabledness(enabled) {
      dirty.modify('enabled', style.enabled, enabled);
      style.enabled = enabled;
      editor.updateLivePreview();
    },

    updateName(isUserInput) {
      if (!editor) return;
      if (isUserInput) {
        const {value} = $('#name');
        dirty.modify('name', style[editor.nameTarget] || style.name, value);
        style[editor.nameTarget] = value;
      }
      editor.updateTitle();
    },

    updateToc(added = editor.sections) {
      if (!toc.el) {
        toc.el = $('#toc');
        toc.elDetails = toc.el.closest('details');
      }
      if (!toc.elDetails.open) return;
      const {sections} = editor;
      const first = sections.indexOf(added[0]);
      const elFirst = toc.el.children[first];
      if (first >= 0 && (!added.focus || !elFirst)) {
        for (let el = elFirst, i = first; i < sections.length; i++) {
          const entry = sections[i].tocEntry;
          if (!deepEqual(entry, toc[i])) {
            if (!el) el = toc.el.appendChild($create('li', {tabIndex: 0}));
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
        toc.el.lastElementChild.remove();
        toc.length--;
      }
      if (added.focus) {
        const cls = 'current';
        const old = $('.' + cls, toc.el);
        const el = elFirst || toc.el.children[first];
        if (old && old !== el) old.classList.remove(cls);
        el.classList.add(cls);
      }
    },

    useSavedStyle(newStyle) {
      if (style.id !== newStyle.id) {
        history.replaceState({}, '', `?id=${newStyle.id}`);
      }
      sessionStore.justEditedStyleId = newStyle.id;
      Object.assign(style, newStyle);
      editor.updateClass();
      editor.updateMeta();
    },
  });
}

//#endregion
//#region editor livePreview

function LivePreview() {
  let data;
  let port;
  let preprocess;
  let enabled = prefs.get('editor.livePreview');

  prefs.subscribe('editor.livePreview', (key, value) => {
    if (!value) {
      if (port) {
        port.disconnect();
        port = null;
      }
    } else if (data && data.id && (data.enabled || editor.dirty.has('enabled'))) {
      createPreviewer();
      updatePreviewer(data);
    }
    enabled = value;
  });

  return {

    /**
     * @param {Function} [fn] - preprocessor
     */
    init(fn) {
      preprocess = fn;
    },

    update(newData) {
      data = newData;
      if (!port) {
        if (!data.id || !data.enabled || !enabled) {
          return;
        }
        createPreviewer();
      }
      updatePreviewer(data);
    },
  };

  function createPreviewer() {
    port = chrome.runtime.connect({name: 'livePreview'});
    port.onDisconnect.addListener(err => {
      throw err;
    });
  }

  async function updatePreviewer(data) {
    const errorContainer = $('#preview-errors');
    try {
      port.postMessage(preprocess ? await preprocess(data) : data);
      errorContainer.classList.add('hidden');
    } catch (err) {
      if (Array.isArray(err)) {
        err = err.join('\n');
      } else if (err && err.index != null) {
        // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
        const pos = editor.getEditors()[0].posFromIndex(err.index);
        err.message = `${pos.line}:${pos.ch} ${err.message || err}`;
      }
      errorContainer.classList.remove('hidden');
      errorContainer.onclick = () => {
        messageBoxProxy.alert(err.message || `${err}`, 'pre');
      };
    }
  }
}

//#endregion
//#region colorpickerHelper

(async function colorpickerHelper() {
  prefs.subscribe('editor.colorpicker.hotkey', (id, hotkey) => {
    CodeMirror.commands.colorpicker = invokeColorpicker;
    const extraKeys = CodeMirror.defaults.extraKeys;
    for (const key in extraKeys) {
      if (extraKeys[key] === 'colorpicker') {
        delete extraKeys[key];
        break;
      }
    }
    if (hotkey) {
      extraKeys[hotkey] = 'colorpicker';
    }
  });

  prefs.subscribe('editor.colorpicker', (id, enabled) => {
    const defaults = CodeMirror.defaults;
    const keyName = prefs.get('editor.colorpicker.hotkey');
    defaults.colorpicker = enabled;
    if (enabled) {
      if (keyName) {
        CodeMirror.commands.colorpicker = invokeColorpicker;
        defaults.extraKeys = defaults.extraKeys || {};
        defaults.extraKeys[keyName] = 'colorpicker';
      }
      defaults.colorpicker = {
        tooltip: t('colorpickerTooltip'),
        popup: {
          tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
          paletteLine: t('numberedLine'),
          paletteHint: t('colorpickerPaletteHint'),
          hexUppercase: prefs.get('editor.colorpicker.hexUppercase'),
          embedderCallback: state => {
            ['hexUppercase', 'color']
              .filter(name => state[name] !== prefs.get('editor.colorpicker.' + name))
              .forEach(name => prefs.set('editor.colorpicker.' + name, state[name]));
          },
          get maxHeight() {
            return prefs.get('editor.colorpicker.maxHeight');
          },
          set maxHeight(h) {
            prefs.set('editor.colorpicker.maxHeight', h);
          },
        },
      };
    } else {
      if (defaults.extraKeys) {
        delete defaults.extraKeys[keyName];
      }
    }
    cmFactory.globalSetOption('colorpicker', defaults.colorpicker);
  }, {runNow: true});

  await baseInit.domReady;

  $('#colorpicker-settings').onclick = function (event) {
    event.preventDefault();
    const input = createHotkeyInput('editor.colorpicker.hotkey', {onDone: () => helpPopup.close()});
    const popup = helpPopup.show(t('helpKeyMapHotkey'), input);
    const bounds = this.getBoundingClientRect();
    popup.style.left = bounds.right + 10 + 'px';
    popup.style.top = bounds.top - popup.clientHeight / 2 + 'px';
    popup.style.right = 'auto';
    $('input', popup).focus();
  };

  function invokeColorpicker(cm) {
    cm.state.colorpicker.openPopup(prefs.get('editor.colorpicker.color'));
  }
})();

//#endregion
