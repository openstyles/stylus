/* global messageBoxProxy */// dom.js
/* global API */// msg.js
/* global clamp debounce */// toolbox.js
/* global editor */
/* global prefs */
/* global t */// localization.js
'use strict';

(async function AutosaveDrafts() {
  const NEW = 'new';
  let delay;
  let draftId = editor.style.id || NEW;

  const draft = await API.drafts.get(draftId);
  if (draft && draft.isUsercss === editor.isUsercss) {
    const date = makeRelativeDate(draft.date);
    if (await messageBoxProxy.confirm(t('draftAction'), 'danger', t('draftTitle', date))) {
      await editor.replaceStyle(draft.style, draft);
    } else {
      updateDraft(false);
    }
  }

  editor.dirty.onDataChange(isDirty => {
    debounce(updateDraft, isDirty ? delay : 0);
  });

  prefs.subscribe('editor.autosaveDelay', (key, val) => {
    delay = clamp(val * 1000 | 0, 1000, 2 ** 32 - 1);
    const t = debounce.timers.get(updateDraft);
    if (t != null) debounce(updateDraft, t);
  }, {runNow: true});

  function makeRelativeDate(date) {
    let delta = (Date.now() - date) / 1000;
    if (delta >= 0 && Intl.RelativeTimeFormat) {
      for (const [span, unit, frac = 1] of [
        [60, 'second', 0],
        [60, 'minute', 0],
        [24, 'hour'],
        [7, 'day'],
        [4, 'week'],
        [12, 'month'],
        [1e99, 'year'],
      ]) {
        if (delta < span) {
          return new Intl.RelativeTimeFormat({style: 'short'}).format(-delta.toFixed(frac), unit);
        }
        delta /= span;
      }
    }
    return date.toLocaleString();
  }

  function updateDraft(isDirty = editor.dirty.isDirty()) {
    const newDraftId = editor.style.id || NEW;
    if (isDirty) {
      API.drafts.put({
        date: Date.now(),
        id: newDraftId,
        isUsercss: editor.isUsercss,
        style: editor.getValue(true),
        si: editor.makeScrollInfo(),
      });
    } else {
      API.drafts.delete(draftId); // the old id may have been 0 when a new style is saved now
    }
    draftId = newDraftId;
  }
})();
