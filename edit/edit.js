'use strict';

define(require => {
  const {API, msg} = require('/js/msg');
  const {
    closeCurrentTab,
    debounce,
    sessionStore,
  } = require('/js/toolbox');
  const {
    $,
    $$,
    $create,
    setupLivePrefs,
  } = require('/js/dom');
  const t = require('/js/localization');
  const prefs = require('/js/prefs');
  const editor = require('./editor');
  const preinit = require('./preinit');
  const linterMan = require('./linter-manager');
  const {CodeMirror, initBeautifyButton} = require('./codemirror-factory');

  let headerHeight;

  window.on('beforeunload', beforeUnload);
  msg.onExtension(onRuntimeMessage);

  (async function init() {
    await preinit;
    buildThemeElement();
    buildKeymapElement();
    setupLivePrefs();
    initNameArea();
    initBeautifyButton($('#beautify'));
    initResizeListener();
    detectLayout(true);

    $('#heading').textContent = t(editor.style.id ? 'editStyleHeading' : 'addStyleTitle');
    $('#preview-label').classList.toggle('hidden', !editor.style.id);
    $('#toc').onclick = e => editor.jumpToEditor([...$('#toc').children].indexOf(e.target));

    await new Promise(requestAnimationFrame);
    (editor.isUsercss ? require('./source-editor') : require('./sections-editor'))();
    await editor.ready;
    editor.ready = true;
    editor.dirty.onChange(editor.updateDirty);

    // enabling after init to prevent flash of validation failure on an empty name
    $('#name').required = !editor.isUsercss;
    $('#save-button').onclick = editor.save;

    prefs.subscribe('editor.toc.expanded', (k, val) => val && editor.updateToc(), {runNow: true});
    prefs.subscribe('editor.linter', (key, value) => {
      $('body').classList.toggle('linter-disabled', value === '');
      linterMan.run();
    });

    require(['./colorpicker-helper'], res => {
      $('#colorpicker-settings').on('click', res);
    });
    require(['./keymap-help'], res => {
      $('#keyMap-help').on('click', res);
    });
    require(['./linter-dialogs'], res => {
      $('#linter-settings').on('click', res.showLintConfig);
      $('#lint-help').on('click', res.showLintHelp);
    });
    require(Object.values(editor.lazyKeymaps), () => {
      buildKeymapElement();
      prefs.subscribe('editor.keyMap', showHotkeyInTooltip, {runNow: true});
      window.on('showHotkeyInTooltip', showHotkeyInTooltip);
    });
    require([
      './autocomplete',
      './global-search',
    ]);
  })();

  function initNameArea() {
    const nameEl = $('#name');
    const resetEl = $('#reset-name');
    const isCustomName = editor.style.updateUrl || editor.isUsercss;
    editor.nameTarget = isCustomName ? 'customName' : 'name';
    nameEl.placeholder = t(editor.isUsercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
    nameEl.title = isCustomName ? t('customNameHint') : '';
    nameEl.on('input', () => {
      editor.updateName(true);
      resetEl.hidden = false;
    });
    resetEl.hidden = !editor.style.customName;
    resetEl.onclick = () => {
      const style = editor.style;
      nameEl.focus();
      nameEl.select();
      // trying to make it undoable via Ctrl-Z
      if (!document.execCommand('insertText', false, style.name)) {
        nameEl.value = style.name;
        editor.updateName(true);
      }
      style.customName = null; // to delete it from db
      resetEl.hidden = true;
    };
    const enabledEl = $('#enabled');
    enabledEl.onchange = () => editor.updateEnabledness(enabledEl.checked);
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
    $('#editor.theme').append(...[
      $create('option', {value: 'default'}, t('defaultTheme')),
      ...require('./codemirror-themes').map(s => $create('option', s)),
    ]);
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
    const selector = $('#editor.keyMap');
    selector.textContent = '';
    selector.appendChild(fragment);
    selector.value = prefs.get('editor.keyMap');
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

  function onRuntimeMessage(request) {
    const {style} = request;
    switch (request.method) {
      case 'styleUpdated':
        if (editor.style.id === style.id &&
            !['editPreview', 'editPreviewEnd', 'editSave', 'config'].includes(request.reason)) {
          Promise.resolve(request.codeIsUpdated === false ? style : API.styles.get(style.id))
            .then(newStyle => editor.replaceStyle(newStyle, request.codeIsUpdated));
        }
        break;
      case 'styleDeleted':
        if (editor.style.id === style.id) {
          closeCurrentTab();
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

  function canSaveWindowPos() {
    return editor.isWindowed &&
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

  function detectLayout(now) {
    const compact = window.innerWidth <= 850;
    if (compact) {
      document.body.classList.add('compact-layout');
      if (!editor.isUsercss) {
        if (now) fixedHeader();
        else debounce(fixedHeader, 250);
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
});
