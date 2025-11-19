import {kCodeMirror, pOpenEditInWindow} from '@/js/consts';
import {saveWindowPosition} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import {sessionStore, t} from '@/js/util';
import editor from './editor';
import {helpPopup} from './util';
import {isWindowed} from './windowed-mode';

window.on('beforeunload', e => {
  if (isWindowed)
    sessionStore.windowPos = JSON.stringify(saveWindowPosition(pOpenEditInWindow) || {});
  API.saveScroll(editor.style.id, editor.makeScrollInfo());
  const activeElement = document.activeElement;
  if (activeElement) {
    // blurring triggers 'change' or 'input' event if needed
    activeElement.blur();
    // refocus if unloading was canceled
    setTimeout(() => activeElement.focus());
  }
  if (editor.dirty.isDirty() ||
    [].some.call(document.$$(helpPopup.SEL + ` .${kCodeMirror}`), el =>
      !el[kCodeMirror].isClean())) {
    // neither confirm() nor custom messages work in modern browsers but just in case
    e.returnValue = t('styleChangesNotSaved');
  }
});
