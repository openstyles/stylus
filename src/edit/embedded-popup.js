import {extraKeys} from '@/cm';
import {$create, $root, $rootCL} from '@/js/dom';
import {getEventKeyName} from '@/js/dom-util';
import * as prefs from '@/js/prefs';
import {actionPopupUrl} from '@/js/urls';
import {t} from '@/js/util';
import {MF_ICON_EXT, MF_ICON_PATH} from '@/js/util-webext';

export default function EmbeddedPopup() {
  const ID = 'popup-iframe';
  const POPUP_HOTKEY = 'Shift-Ctrl-Alt-S';
  let /** @type {HTMLIFrameElement} */ frame;
  let /** @type {HTMLBodyElement} */ fBody;
  let isLoaded;
  let /** @type {Window} */ fw;
  let /** @type {HTMLElement} */ sensor;
  let /** @type {MutationObserver} */ mo;
  let /** @type {IntersectionObserver} */ xo;

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
    frame = $create('iframe', {
      id: ID,
      src: actionPopupUrl,
      width: prefs.__values.popupWidth,
      onload: initFrame,
    });
    window.on('mousedown', removePopup);
    window.on('resize', onEditorResized);
    document.body.appendChild(frame);
  }

  function initFrame() {
    frame = this;
    frame.focus();
    fw = frame.contentWindow;
    fBody = fw.document.body;
    onEditorResized();
    fw.on('keydown', removePopupOnEsc);
    fw.close = removePopup;
    sensor ||= $create('div', {style: 'height: 1px; margin-top: 0px;'});
    xo = new IntersectionObserver(onIntersect, {threshold: [0, 1]});
    xo.observe(fBody.appendChild(sensor));
    mo = new fw.MutationObserver(onMutation);
    mo.observe(fBody, {
      attributes: true,
      attributeFilter: ['style'],
    });
  }

  function onEditorResized() {
    fBody.style.maxHeight = innerHeight + 'px';
  }

  function onMutation() {
    frame.width = fBody.clientWidth + 'px';
    onIntersect();
  }

  function onIntersect() {
    frame.height = Math.max(
      sensor.getBoundingClientRect().y | 0,
      sensor.nextSibling && fBody.clientHeight || 0,
    );
    if (!isLoaded) {
      isLoaded = true;
      frame.dataset.loaded = '';
    }
  }

  function removePopup() {
    mo.disconnect();
    xo.disconnect();
    mo = xo = frame = null;
    $id(ID)?.remove();
    window.off('mousedown', removePopup);
    window.off('resize', onEditorResized);
  }

  function removePopupOnEsc(e) {
    if (getEventKeyName(e) === 'Escape') {
      removePopup();
    }
  }
}
