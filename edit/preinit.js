'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {sessionStore, tryCatch, tryJSONparse} = require('/js/toolbox');
  const {waitForSelector} = require('/js/dom');
  const prefs = require('/js/prefs');
  const editor = require('./editor');
  const util = require('./util');

  const lazyKeymaps = {
    emacs: '/vendor/codemirror/keymap/emacs',
    vim: '/vendor/codemirror/keymap/vim',
  };

  // resize the window on 'undo close'
  if (chrome.windows) {
    const pos = tryJSONparse(sessionStore.windowPos);
    delete sessionStore.windowPos;
    if (pos && pos.left != null && chrome.windows) {
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
    }
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

  return Promise.all([
    preinit(),
    prefs.initializing.then(() =>
      Promise.all([
        loadTheme(),
        loadKeymaps(),
      ])),
    waitForSelector('#sections'),
  ]);
});
