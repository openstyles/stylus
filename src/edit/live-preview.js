import {$} from '/js/dom';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {UCD} from '/js/toolbox';
import editor from './editor';

const ID = 'editor.livePreview';
let errPos;
let el;
let data;
let port;
let enabled = prefs.get(ID);

prefs.subscribe(ID, (key, value) => {
  if (!value) {
    if (port) {
      port.disconnect();
      port = null;
    }
  } else if (data && data.id && (data.enabled || editor.dirty.has('enabled'))) {
    createPreviewer();
    updatePreviewer(data);
  }
  enabled = value;
});

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
  el = $('#preview-errors');
  el.onclick = showError;
}

function showError() {
  if (errPos) {
    const cm = editor.getEditors()[0];
    cm.setCursor(errPos);
    cm.focus();
  }
}

async function updatePreviewer(data) {
  try {
    await API.styles.preview(data);
    el.hidden = true;
  } catch (err) {
    const ucd = data[UCD];
    const pp = ucd && ucd.preprocessor;
    const shift = err._varLines + 1 || 0;
    errPos = pp && err.line && err.column
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
    } else if (pp === 'stylus' && (errPos = err.match(/^\w+:(\d+):(\d+)(?:\n.+)+\s+(.+)/))) {
      err = errPos[3];
      errPos = {line: errPos[1] - shift, ch: errPos[2] - 1};
    }
    el.title =
      el.firstChild.textContent = (errPos ? `${errPos.line + 1}:${errPos.ch + 1} ` : '') + err;
    el.lastChild.hidden = !(el.lastChild.href = editor.ppDemo[pp]);
    el.hidden = false;
  }
}
