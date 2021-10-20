/* global $ $create $remove getEventKeyName */// dom.js
/* global CodeMirror */
/* global baseInit */// base.js
/* global prefs */
/* global t */// localization.js
'use strict';

(() => {
  const ID = 'popup-iframe';
  const SEL = '#' + ID;
  const URL = chrome.runtime.getManifest().browser_action.default_popup;
  const POPUP_HOTKEY = 'Shift-Ctrl-Alt-S';
  /** @type {HTMLIFrameElement} */
  let frame;
  let isLoaded;
  let scrollbarWidth;

  const btn = $create('img', {
    id: 'popup-button',
    title: t('optionsCustomizePopup') + '\n' + POPUP_HOTKEY,
    onclick: embedPopup,
  });
  document.documentElement.appendChild(btn);
  baseInit.domReady.then(() => {
    document.body.appendChild(btn);
    // Adding a dummy command to show in keymap help popup
    CodeMirror.defaults.extraKeys[POPUP_HOTKEY] = 'openStylusPopup';
  });

  prefs.subscribe('iconset', (_, val) => {
    const prefix = `images/icon/${val ? 'light/' : ''}`;
    btn.srcset = `${prefix}16.png 1x,${prefix}32.png 2x`;
  }, {runNow: true});

  window.on('keydown', e => {
    if (getEventKeyName(e) === POPUP_HOTKEY) {
      embedPopup();
    }
  });

  function embedPopup() {
    if ($(SEL)) return;
    isLoaded = false;
    scrollbarWidth = 0;
    frame = $create('iframe', {
      id: ID,
      src: URL,
      height: 600,
      width: prefs.get('popupWidth'),
      onload: initFrame,
    });
    window.on('mousedown', removePopup);
    document.body.appendChild(frame);
  }

  function initFrame() {
    frame = this;
    frame.focus();
    const pw = frame.contentWindow;
    const body = pw.document.body;
    pw.on('keydown', removePopupOnEsc);
    pw.close = removePopup;
    if (pw.IntersectionObserver) {
      new pw.IntersectionObserver(onIntersect).observe(body.appendChild(
        $create('div', {style: {height: '1px', marginTop: '-1px'}})
      ));
    } else {
      frame.dataset.loaded = '';
      frame.height = body.scrollHeight;
    }
    new pw.MutationObserver(onMutation).observe(body, {
      attributes: true,
      attributeFilter: ['style'],
    });
  }

  function onMutation() {
    const body = frame.contentDocument.body;
    const bs = body.style;
    const w = parseFloat(bs.minWidth || bs.width) + (scrollbarWidth || 0);
    const h = parseFloat(bs.minHeight || body.offsetHeight);
    if (frame.width - w) frame.width = w;
    if (frame.height - h) frame.height = h;
  }

  function onIntersect([e]) {
    const pw = frame.contentWindow;
    const el = pw.document.scrollingElement;
    const h = e.isIntersecting && !pw.scrollY ? el.offsetHeight : el.scrollHeight;
    const hasSB = h > el.offsetHeight;
    const {width} = e.boundingClientRect;
    frame.height = h;
    if (!hasSB !== !scrollbarWidth || frame.width - width) {
      scrollbarWidth = hasSB ? width - el.offsetWidth : 0;
      frame.width = width + scrollbarWidth;
    }
    if (!isLoaded) {
      isLoaded = true;
      frame.dataset.loaded = '';
    }
  }

  function removePopup() {
    frame = null;
    $remove(SEL);
    window.off('mousedown', removePopup);
  }

  function removePopupOnEsc(e) {
    if (getEventKeyName(e) === 'Escape') {
      removePopup();
    }
  }
})();
