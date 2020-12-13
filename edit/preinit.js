'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {
    FIREFOX,
    getOwnTab,
    sessionStore,
    tryCatch,
    tryJSONparse,
  } = require('/js/toolbox');
  const {$, waitForSelector} = require('/js/dom');
  const prefs = require('/js/prefs');
  const editor = require('./editor');
  const util = require('./util');

  const lazyKeymaps = {
    emacs: '/vendor/codemirror/keymap/emacs',
    vim: '/vendor/codemirror/keymap/vim',
  };
  const domReady = waitForSelector('#sections');
  let ownTabId;

  // resize the window on 'undo close'
  if (chrome.windows) {
    initWindowedMode();
    const pos = tryJSONparse(sessionStore.windowPos);
    delete sessionStore.windowPos;
    if (pos && pos.left != null && chrome.windows) {
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
    }
  }

  getOwnTab().then(async tab => {
    ownTabId = tab.id;
    // use browser history back when 'back to manage' is clicked
    if (sessionStore['manageStylesHistory' + ownTabId] === location.href) {
      await domReady;
      $('#cancel-button').onclick = event => {
        event.stopPropagation();
        event.preventDefault();
        history.back();
      };
    }
  });

  async function initWindowedMode() {
    chrome.tabs.onAttached.addListener(onTabAttached);
    editor.isWindowSimple =
      (await browser.windows.getCurrent()).type === 'popup';
    if (editor.isWindowSimple) {
      Promise.all([
        require(['./embedded-popup']),
        domReady,
      ]).then(([_]) => _.initPopupButton());
    }
    editor.isWindowed = editor.isWindowSimple || (
      history.length === 1 &&
      await prefs.initializing && prefs.get('openEditInWindow') &&
      (await browser.windows.getAll()).length > 1 &&
      (await browser.tabs.query({currentWindow: true})).length === 1
    );
  }

  /** Preloads the theme so CodeMirror can use the correct metrics in its first render */
  function loadTheme() {
    return new Promise(resolve => {
      const theme = prefs.get('editor.theme');
      if (theme === 'default') {
        resolve();
      } else {
        const el = document.querySelector('#cm-theme');
        el.href = `vendor/codemirror/theme/${theme}.css`;
        el.on('load', resolve, {once: true});
        el.on('error', () => {
          prefs.set('editor.theme', 'default');
          resolve();
        }, {once: true});
      }
    });
  }

  /** Preloads vim/emacs keymap only if it's the active one, otherwise will load later */
  function loadKeymaps() {
    const km = prefs.get('editor.keyMap');
    return /emacs/i.test(km) && require([lazyKeymaps.emacs]) ||
      /vim/i.test(km) && require([lazyKeymaps.vim]);
  }

  async function onTabAttached(tabId, info) {
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

  async function preinit() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('id'));
    const style = id && await API.styles.get(id) || {
      name: params.get('domain') ||
        tryCatch(() => new URL(params.get('url-prefix')).hostname) ||
        '',
      enabled: true,
      sections: [
        util.DocFuncMapper.toSection([...params], {code: ''}),
      ],
    };
    // switching the mode here to show the correct page ASAP, usually before DOMContentLoaded
    editor.isUsercss = Boolean(style.usercssData || !style.id && prefs.get('newStyleAsUsercss'));
    editor.lazyKeymaps = lazyKeymaps;
    editor.style = style;
    editor.updateTitle(false);
    document.documentElement.classList.toggle('usercss', editor.isUsercss);
    sessionStore.justEditedStyleId = style.id || '';
    // no such style so let's clear the invalid URL parameters
    if (!style.id) history.replaceState({}, '', location.pathname);
  }

  return Promise.all([
    preinit(),
    prefs.initializing.then(() =>
      Promise.all([
        loadTheme(),
        loadKeymaps(),
      ])),
    domReady,
  ]);
});
