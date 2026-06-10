import {pLivePreview, UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {debounce} from '@/js/util';
import editor from './editor';

let errPos;
/** @type {HTMLElement} */
let elErr;
let data;
let port;
let enabled;

prefs.subscribe(pLivePreview, (key, value, init) => {
  enabled = value;
  if (init) return;
  if (!value) {
    if (port) {
      port.disconnect();
      port = null;
    }
  } else {
    livePreviewNow();
  }
}, true);

export function livePreview() {
  debounce(livePreviewNow, prefs.__values[pLivePreview + '.delay'] * 1000);
}

export function livePreviewNow() {
  if (!enabled
  || !editor.style.id // not saved
  || !editor.style.enabled && data && !data.enabled // disabled both before and now
  || !port && !editor.dirty.isDirty() // not modified since the style was saved and thus applied
  ) return;
  data = editor.getValue(true);
  updatePreviewer();
}

function showError() {
  if (errPos) {
    const cm = editor.getEditors()[0];
    cm.jumpToPos(errPos);
    cm.focus();
  }
}

async function updatePreviewer() {
  if (!port) {
    port = chrome.runtime.connect({name: 'livePreview:' + editor.style.id});
    port.onDisconnect.addListener(() => (port = null));
    elErr = $id('preview-errors');
    elErr.onclick = showError;
  }
  try {
    const res = await API.styles.preview(data);
    elErr.hidden = true;
    livePreview._then?.(res);
  } catch (err) {
    if (typeof err === 'string')
      err = new Error(err);
    const ucd = data[UCD];
    const pp = ucd && ucd.preprocessor;
    const shift = err._varLines + 1 || 0;
    errPos = pp && (err.line ??= err.lineno) && err.column
      ? {line: err.line - shift, ch: err.column - 1}
      : err.index;
    if (Array.isArray(err)) {
      err = err.map((e, a, b) => !(a = e.message) ? e : ((b = e.context)) ? `${a} in ${b}` : a)
        .join('\n');
    } else {
      err = err.message || `${err}`;
    }
    if (errPos >= 0) {
      // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
      errPos = editor.getEditors()[0].posFromIndex(errPos);
    } else if (!errPos && pp === 'stylus' && (
      errPos = err.match(/^\w+:(\d+):(\d+)(?:\n.+)+\s+(.+)/)
    )) {
      err = errPos[3];
      errPos = {line: errPos[1] - shift, ch: errPos[2] - 1};
    }
    elErr.title =
      elErr.firstChild.textContent = (errPos ? `${errPos.line + 1}:${errPos.ch + 1} ` : '') + err;
    elErr.lastChild.hidden = !(elErr.lastChild.href = editor.ppDemo[pp]);
    elErr.hidden = false;
  }
}
