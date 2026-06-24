import {$create} from '@/js/dom';
import {formatRelativeDate} from '@/js/localization';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {styleToCss} from '@/js/style-util';
import {clamp, debounce, NOP, t} from '@/js/util';
import editor from './editor';
import {helpPopup, showCodeMirrorPopup} from './util';

const makeId = () => editor.style.id || 'new';
let delay;
let port;

maybeRestore().then(() => {
  editor.dirty.onChange(isDirty => isDirty ? !port && connectPort() : port?.disconnect());
  editor.dirty.onDataChange(isDirty => debounce(updateDraft, isDirty ? delay : 0));
  prefs.subscribe('editor.autosaveDraft', (key, val) => {
    delay = clamp(val * 1000 | 0, 1000, 2 ** 32 - 1);
    const timer = debounce.timers.get(updateDraft);
    if (timer) debounce(updateDraft, timer.delay ? delay : 0);
  }, true);
});

async function maybeRestore() {
  const draft = await API.draftsDB.get(makeId());
  let resolve, style, value;
  if (!draft
  || !(style = draft.style)
  || !(value = draft.isUsercss ? style.sourceCode : styleToCss(style))
  || draft.isUsercss !== editor.isUsercss
  || editor.isSame(draft.style)) {
    return;
  }
  const onYes = () => resolve(true);
  const onNo = () => resolve(false);
  const info = t('draftTitle', formatRelativeDate(draft.date));
  const popup = showCodeMirrorPopup(info, '', {value, readOnly: true});
  const buttons = [t('confirmYes'), t('confirmNo')].map((btn, i) =>
    $create('button', {onclick: i ? onNo : onYes}, btn));
  popup.className += ' danger';
  popup.onClose.add(onNo);
  popup._contents.append(
    $create('p', t('draftAction')),
    $create('.buttons', buttons)
  );
  if (await new Promise(r => (resolve = r))) {
    style.id = editor.style.id;
    buttons.forEach(b => (b.disabled = true));
    await editor.replaceStyle(style, draft);
  } else {
    API.draftsDB.delete(makeId()).catch(NOP);
  }
  helpPopup.close();
}

function connectPort() {
  port = chrome.runtime.connect({name: 'draft:' + makeId()});
  port.onDisconnect.addListener(() => (port = null));
}

function updateDraft(isDirty = editor.dirty.isDirty()) {
  if (!isDirty) return;
  API.draftsDB.put({
    date: new Date(),
    isUsercss: editor.isUsercss,
    style: editor.getValue(true),
    si: editor.makeScrollInfo(),
  }, makeId());
}
