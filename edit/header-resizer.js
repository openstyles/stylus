/* global $ $$ */// dom.js
/* global editor */
/* global prefs */
'use strict';

(function HeaderResizer() {
  const el = $('#header-resizer');
  let lastW, lastX;
  el.onmousedown = e => {
    if (e.button) return;
    lastW = $('#header').clientWidth;
    lastX = e.clientX;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };
  function resize({clientX: x}) {
    const w = editor.updateHeaderWidth(lastW + x - lastX);
    const delta = w - lastW;
    if (delta) {
      lastW = w;
      lastX = x;
      prefs.set('editor.headerWidth', w);
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
        el.style.width = parseFloat(el.style.width) - delta + 'px';
      }
    }
  }
  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
  }
})();
