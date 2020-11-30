'use strict';

define(require => {
  const {API, msg} = require('/js/msg');
  const {
    FIREFOX,
    closeCurrentTab,
    debounce,
    getOwnTab,
    sessionStore,
  } = require('/js/toolbox');
  const {
    $,
    $$,
    $create,
    $remove,
    getEventKeyName,
    onDOMready,
    setupLivePrefs,
  } = require('/js/dom');
  const t = require('/js/localization');
  const prefs = require('/js/prefs');
  const editor = require('./editor');
  const preinit = require('./preinit');
  const linterMan = require('./linter-manager');
  const {CodeMirror, initBeautifyButton} = require('./codemirror-factory');

  let headerHeight;
  let isSimpleWindow;
  let isWindowed;

  window.on('beforeunload', beforeUnload);
  msg.onExtension(onRuntimeMessage);

  lazyInit();

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

  /* Stuff not needed for the main init so we can let it run at its own tempo */
  function lazyInit() {
    let ownTabId;
    // not using `await` so we don't block the subsequent code
    getOwnTab().then(patchHistoryBack);
    // no windows on android
    if (chrome.windows) {
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
    async function detectWindowedState() {
      isSimpleWindow =
        (await browser.windows.getCurrent()).type === 'popup';
      isWindowed = isSimpleWindow || (
        prefs.get('openEditInWindow') &&
        history.length === 1 &&
        (await browser.windows.getAll()).length > 1 &&
        (await browser.tabs.query({currentWindow: true})).length === 1
      );
      if (isSimpleWindow) {
        await onDOMready();
        initPopupButton();
      }
    }
    function initPopupButton() {
      const POPUP_HOTKEY = 'Shift-Ctrl-Alt-S';
      const btn = $create('img', {
        id: 'popup-button',
        title: t('optionsCustomizePopup') + '\n' + POPUP_HOTKEY,
        onclick: embedPopup,
      });
      const onIconsetChanged = (_, val) => {
        const prefix = `images/icon/${val ? 'light/' : ''}`;
        btn.srcset = `${prefix}16.png 1x,${prefix}32.png 2x`;
      };
      prefs.subscribe('iconset', onIconsetChanged, {runNow: true});
      document.body.appendChild(btn);
      window.on('keydown', e => getEventKeyName(e) === POPUP_HOTKEY && embedPopup());
      CodeMirror.defaults.extraKeys[POPUP_HOTKEY] = 'openStylusPopup'; // adds to keymap help
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

  function embedPopup() {
    const ID = 'popup-iframe';
    const SEL = '#' + ID;
    if ($(SEL)) return;
    const frame = $create('iframe', {
      id: ID,
      src: chrome.runtime.getManifest().browser_action.default_popup,
      height: 600,
      width: prefs.get('popupWidth'),
      onload() {
        frame.onload = null;
        frame.focus();
        const pw = frame.contentWindow;
        const body = pw.document.body;
        pw.on('keydown', e => getEventKeyName(e) === 'Escape' && embedPopup._close());
        pw.close = embedPopup._close;
        if (pw.IntersectionObserver) {
          let loaded;
          new pw.IntersectionObserver(([e]) => {
            const el = pw.document.scrollingElement;
            const h = e.isIntersecting && !pw.scrollY ? el.offsetHeight : el.scrollHeight;
            const hasSB = h > el.offsetHeight;
            const {width} = e.boundingClientRect;
            frame.height = h;
            if (!hasSB !== !frame._scrollbarWidth || frame.width - width) {
              frame._scrollbarWidth = hasSB ? width - el.offsetWidth : 0;
              frame.width = width + frame._scrollbarWidth;
            }
            if (!loaded) {
              loaded = true;
              frame.dataset.loaded = '';
            }
          }).observe(body.appendChild(
            $create('div', {style: {height: '1px', marginTop: '-1px'}})
          ));
        } else {
          frame.dataset.loaded = '';
          frame.height = body.scrollHeight;
        }
        new pw.MutationObserver(() => {
          const bs = body.style;
          const w = parseFloat(bs.minWidth || bs.width) + (frame._scrollbarWidth || 0);
          const h = parseFloat(bs.minHeight || body.offsetHeight);
          if (frame.width - w) frame.width = w;
          if (frame.height - h) frame.height = h;
        }).observe(body, {attributes: true, attributeFilter: ['style']});
      },
    });
    // saving the listener here so it's the same function reference for window.off
    if (!embedPopup._close) {
      embedPopup._close = () => {
        $remove(SEL);
        window.off('mousedown', embedPopup._close);
      };
    }
    window.on('mousedown', embedPopup._close);
    document.body.appendChild(frame);
  }
});
