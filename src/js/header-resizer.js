import {header} from '@/js/dom';
import * as prefs from './prefs';

export default function HeaderResizer() {
  let curW = $id('header').offsetWidth;
  let offset, perPage;
  prefs.subscribe(header.prefId, (key, val) => setWidth(val));
  $id('header-resizer').onmousedown = e => {
    if (e.button) return;
    offset = curW - e.clientX;
    perPage = e.shiftKey;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };

  function resize(e) {
    setWidth(offset + e.clientX);
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
    save();
  }

  function save() {
    if (perPage) {
      prefs.set(header.prefId, curW);
    } else {
      for (const k of prefs.knownKeys) {
        if (k.startsWith(header.prefHub))
          prefs.set(k, curW);
      }
    }
  }

  function setWidth(w) {
    const delta = (w = header.setWidth(w)) - curW;
    if (delta) {
      curW = w;
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]')) {
        el.style.width = parseFloat(el.style.width) - delta + 'px';
      }
    }
  }
}
