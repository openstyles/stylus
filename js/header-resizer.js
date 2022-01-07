/* global $ $$ dom */// dom.js
/* global debounce */// toolbox.js
/* global prefs */
'use strict';

(() => {
  let curW, offset, active;
  prefs.subscribe(dom.HWprefId, (key, val) => {
    if (!active && val !== curW) {
      getCurWidth();
      setWidth(val);
    }
  });
  $('#header-resizer').onmousedown = e => {
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

  /** @param {MouseEvent} e */
  function resize(e) {
    if (setWidth(offset + e.clientX)) {
      debounce(save, 250, e.shiftKey);
    }
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
    active = false;
  }

  function save(all) {
    if (all) {
      for (const k of prefs.knownKeys) {
        if (k.startsWith(dom.HW)) prefs.set(k, curW);
      }
    } else {
      prefs.set(dom.HWprefId, curW);
    }
  }

  function setWidth(w) {
    const delta = (w = dom.setHWProp(w)) - curW;
    if (delta) {
      curW = w;
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
        el.style.width = parseFloat(el.style.width) - delta + 'px';
      }
      return true;
    }
  }
})();
