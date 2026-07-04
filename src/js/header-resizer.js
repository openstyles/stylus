import {$root} from '@/js/dom';
import * as prefs from './prefs';

export let headerWidth;

export default async function HeaderResizer() {
  const page = location.pathname.match(/^.(\w*)/)[1];
  const prefId = 'headerWidth.' + page;
  if (!prefs.__defaults[prefId])
    return;
  let offset, perPage;
  prefs.subscribe(prefId, setWidth, true);

  $id('header-resizer').onmousedown = e => {
    if (e.button) return;
    offset = headerWidth - e.clientX;
    perPage = e.shiftKey;
    document.body.classList.add('resizing-h');
    document.on('mousemove', resize);
    document.on('mouseup', resizeStop);
  };

  function resize(e) {
    setWidth(prefId, offset + e.clientX);
  }

  function resizeStop() {
    document.off('mouseup', resizeStop);
    document.off('mousemove', resize);
    document.body.classList.remove('resizing-h');
    save();
  }

  function save() {
    if (perPage) {
      prefs.set(prefId, headerWidth);
    } else {
      for (const k of prefs.knownKeys) {
        if (k.startsWith('headerWidth.'))
          prefs.set(k, headerWidth);
      }
    }
  }

  function setWidth(k, width) {
    // If this is a small window on a big monitor the user can maximize it later
    // Note that `outerWidth` doesn't force a layout recalc unlike `innerWidth`
    const max = (outerWidth < 850 ? screen.availWidth : outerWidth) / 3;
    const delta = (width = Math.round(Math.max(200, Math.min(max, +width || 0)))) - headerWidth;
    if (delta || !headerWidth)
      $root.style.setProperty('--header-width', width + 'px');
    if (delta)
      for (const el of $$('.CodeMirror-linewidget[style*="width:"]'))
        el.style.width = parseFloat(el.style.width) - delta + 'px';
    headerWidth = width;
  }
}
