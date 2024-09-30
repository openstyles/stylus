/* global $create */// dom.js
/* global API */// msg.js
/* global clamp debounce */// toolbox.js
/* global editor */
/* global MozDocMapper */// sections-util.js
/* global helpPopup showCodeMirrorPopup */// util.js
/* global prefs */
/* global t */// localization.js
'use strict';

(async function AutosaveDrafts() {
  const makeId = () => editor.style.id || 'new';
  let delay;
  let port;
  connectPort();
  await maybeRestore();
  editor.dirty.onChange(isDirty => isDirty ? connectPort() : port.disconnect());
  editor.dirty.onDataChange(isDirty => debounce(updateDraft, isDirty ? delay : 0));

  prefs.subscribe('editor.autosaveDraft', (key, val) => {
    delay = clamp(val * 1000 | 0, 1000, 2 ** 32 - 1);
    const t = debounce.timers.get(updateDraft);
    if (t) debounce(updateDraft, t.delay ? delay : 0);
  }, true);

  async function maybeRestore() {
    const [draft] = await Promise.all([
      API.drafts.get(makeId()),
      require(['/js/dlg/message-box.css']),
    ]);
    if (!draft || draft.isUsercss !== editor.isUsercss || editor.isSame(draft.style)) {
      return;
    }
    let resolve;
    const {style} = draft;
    const onYes = () => resolve(true);
    const onNo = () => resolve(false);
    const value = draft.isUsercss ? style.sourceCode : MozDocMapper.styleToCss(style);
    const info = t('draftTitle', t.formatRelativeDate(draft.date));
    const popup = showCodeMirrorPopup(info, '', {value, readOnly: true});
    popup.className += ' danger';
    popup.onClose.add(onNo);
    popup._contents.append(
      $create('p', t('draftAction')),
      $create('.buttons', [t('confirmYes'), t('confirmNo')].map((btn, i) =>
        $create('button', {textContent: btn, onclick: i ? onNo : onYes})))
    );
    if (await new Promise(r => (resolve = r))) {
      style.id = editor.style.id;
      await editor.replaceStyle(style, draft);
    } else {
      API.drafts.delete(makeId()).catch(() => {});
    }
    helpPopup.close();
  }

  function connectPort() {
    port = chrome.runtime.connect({name: 'draft:' + makeId()});
  }

  function updateDraft(isDirty = editor.dirty.isDirty()) {
    if (!isDirty) return;
    API.drafts.put({
      date: Date.now(),
      isUsercss: editor.isUsercss,
      style: editor.getValue(true),
      si: editor.makeScrollInfo(),
    }, makeId());
  }
})();
