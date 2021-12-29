/* global $ $$ */// dom.js
/* global editor */
/* global prefs */
'use strict';

(function HeaderResizer() {
  const PREF_ID = 'editor.headerWidth';
  const el = $('#header-resizer');
  let lastW, lastX;
  prefs.subscribe(PREF_ID, (key, val) => {
    setLastWidth();
    setWidth(val);
  });
  el.onmousedown = e => {
    if (e.button) return;
    setLastWidth();
    lastX = e.clientX;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };

  function resize({clientX: x}) {
    const w = setWidth(lastW + x - lastX);
    if (!w) return;
    lastW = w;
    lastX = x;
    prefs.set(PREF_ID, w);
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
  }

  function setLastWidth() {
    lastW = $('#header').clientWidth;
  }

  /** @returns {number|void} new width in case it's different, otherwise void */
  function setWidth(w) {
    const delta = (w = editor.updateHeaderWidth(w)) - lastW;
    if (!delta) return;
    for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
      el.style.width = parseFloat(el.style.width) - delta + 'px';
    }
    return w;
  }
})();
