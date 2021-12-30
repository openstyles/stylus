/* global $ $$ */// dom.js
/* global editor */
/* global prefs */
'use strict';

(function HeaderResizer() {
  const PREF_ID = 'editor.headerWidth';
  const el = $('#header-resizer');
  let curW, offset;
  prefs.subscribe(PREF_ID, (key, val) => {
    rememberCurWidth();
    setWidth(val);
  });
  el.onmousedown = e => {
    if (e.button) return;
    rememberCurWidth();
    offset = curW - e.clientX;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };

  function rememberCurWidth() {
    curW = $('#header').offsetWidth;
  }

  function resize({clientX: x}) {
    prefs.set(PREF_ID, setWidth(offset + x));
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
  }

  /** @returns {number|void} new width in case it's different, otherwise void */
  function setWidth(w) {
    const delta = (w = editor.updateHeaderWidth(w)) - curW;
    if (delta) {
      curW = w;
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
        el.style.width = parseFloat(el.style.width) - delta + 'px';
      }
    }
    return w;
  }
})();
