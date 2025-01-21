import {extraKeys} from '@/cm';
import {$create} from '@/js/dom';
import {getEventKeyName} from '@/js/dom-util';
import * as prefs from '@/js/prefs';
import {actionPopupUrl} from '@/js/urls';
import {t} from '@/js/util';
import {MF_ICON_EXT, MF_ICON_PATH} from '@/js/util-webext';

export default function EmbeddedPopup() {
  const ID = 'popup-iframe';
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
  $root.appendChild(btn);
  $rootCL.add('popup-window');
  document.body.appendChild(btn);
  // Adding a dummy command to show in keymap help popup
  extraKeys[POPUP_HOTKEY] = 'openStylusPopup';

  prefs.subscribe('iconset', (_, val) => {
    const prefix = `${MF_ICON_PATH}${val ? 'light/' : ''}`;
    btn.srcset = `${prefix}16${MF_ICON_EXT} 1x,${prefix}32${MF_ICON_EXT} 2x`;
  }, true);

  window.on('keydown', e => {
    if (getEventKeyName(e) === POPUP_HOTKEY) {
      embedPopup();
    }
  });

  function embedPopup() {
    if ($id(ID)) return;
    isLoaded = false;
    scrollbarWidth = 0;
    frame = $create('iframe', {
      id: ID,
      src: actionPopupUrl,
      height: 600,
      width: prefs.__values.popupWidth,
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
    new pw.IntersectionObserver(onIntersect).observe(body.appendChild(
      $create('div', {style: 'height: 1px; marginTop: -1px;'})
    ));
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
    const h = e.intersectionRatio && !pw.scrollY ? el.offsetHeight : el.scrollHeight;
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
    $id(ID)?.remove();
    window.off('mousedown', removePopup);
  }

  function removePopupOnEsc(e) {
    if (getEventKeyName(e) === 'Escape') {
      removePopup();
    }
  }
}
