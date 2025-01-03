import {UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import editor from './editor';

const ID = 'editor.livePreview';
let errPos;
let el;
let data;
let port;
let enabled;

prefs.subscribe(ID, (key, value, init) => {
  enabled = value;
  if (init) return;
  if (!value) {
    if (port) {
      port.disconnect();
      port = null;
    }
  } else if (data && data.id && (data.enabled || editor.dirty.has('enabled'))) {
    createPreviewer();
    updatePreviewer(data);
  }
}, true);

editor.livePreview = newData => {
  if (!port) {
    if (!enabled
      || !newData.id // not saved
      || !newData.enabled && data && !data.enabled // disabled both before and now
      || !editor.dirty.isDirty()) {
      return;
    }
    createPreviewer();
  }
  data = newData;
  updatePreviewer(data);
};

function createPreviewer() {
  port = chrome.runtime.connect({name: 'livePreview:' + editor.style.id});
  port.onDisconnect.addListener(() => (port = null));
  el = $id('preview-errors');
  el.onclick = showError;
}

function showError() {
  if (errPos) {
    const cm = editor.getEditors()[0];
    cm.jumpToPos(errPos);
    cm.focus();
  }
}

async function updatePreviewer(newData) {
  try {
    await API.styles.preview(newData);
    el.hidden = true;
  } catch (err) {
    const ucd = newData[UCD];
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
    el.title =
      el.firstChild.textContent = (errPos ? `${errPos.line + 1}:${errPos.ch + 1} ` : '') + err;
    el.lastChild.hidden = !(el.lastChild.href = editor.ppDemo[pp]);
    el.hidden = false;
  }
}
