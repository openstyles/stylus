/* global $ $$ */// dom.js
/* global editor */
/* global debounce */// toolbox.js
/* global prefs */
'use strict';

(function HeaderResizer() {
  const PREF_ID = 'editor.headerWidth';
  const el = $('#header-resizer');
  let curW, offset, active;
  prefs.subscribe(PREF_ID, (key, val) => {
    if (!active && val !== curW) {
      getCurWidth();
      setWidth(val);
    }
  });
  el.onmousedown = e => {
    if (e.button) return;
    getCurWidth();
    offset = curW - e.clientX;
    active = true;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };

  function getCurWidth() {
    curW = parseFloat(document.documentElement.style.getPropertyValue('--header-width'))
      || $('#header').offsetWidth;
  }

  function resize({clientX: x}) {
    if (setWidth(offset + x)) {
      debounce(save, 250);
    }
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
    active = false;
  }

  function save() {
    prefs.set(PREF_ID, curW);
  }

  function setWidth(w) {
    const delta = (w = editor.updateHeaderWidth(w)) - curW;
    if (delta) {
      curW = w;
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
        el.style.width = parseFloat(el.style.width) - delta + 'px';
      }
      return true;
    }
  }
})();
