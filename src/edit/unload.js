import {t} from '@/js/localization';
import {API} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {sessionStore} from '@/js/util';
import editor from './editor';

window.on('beforeunload', e => {
  let pos;
  if (editor.isWindowed &&
      document.visibilityState === 'visible' &&
      prefs.get('openEditInWindow') &&
      screenX !== -32000 && // Chrome uses this value for minimized windows
      ( // only if not maximized
        screenX > 0 || outerWidth < screen.availWidth ||
        screenY > 0 || outerHeight < screen.availHeight ||
        screenX <= -10 || outerWidth >= screen.availWidth + 10 ||
        screenY <= -10 || outerHeight >= screen.availHeight + 10
      )
  ) {
    pos = {
      left: screenX,
      top: screenY,
      width: outerWidth,
      height: outerHeight,
    };
    prefs.set('windowPosition', pos);
  }
  sessionStore.windowPos = JSON.stringify(pos || {});
  API.data.set('editorScrollInfo' + editor.style.id, editor.makeScrollInfo());
  const activeElement = document.activeElement;
  if (activeElement) {
    // blurring triggers 'change' or 'input' event if needed
    activeElement.blur();
    // refocus if unloading was canceled
    setTimeout(() => activeElement.focus());
  }
  if (editor.dirty.isDirty()) {
    // neither confirm() nor custom messages work in modern browsers but just in case
    e.returnValue = t('styleChangesNotSaved');
  }
});
