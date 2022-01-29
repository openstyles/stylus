/* global messageBoxProxy */// dom.js
/* global API */// msg.js
/* global clamp debounce */// toolbox.js
/* global editor */
/* global prefs */
/* global t */// localization.js
'use strict';

(async function AutosaveDrafts() {
  const makeId = () => editor.style.id || 'new';
  let delay;
  let port;
  connectPort();

  const draft = await API.drafts.get(makeId());
  if (draft && draft.isUsercss === editor.isUsercss) {
    const date = makeRelativeDate(draft.date);
    if (await messageBoxProxy.confirm(t('draftAction'), 'danger', t('draftTitle', date))) {
      await editor.replaceStyle(draft.style, draft);
    } else {
      API.drafts.delete(makeId());
    }
  }

  editor.dirty.onChange(isDirty => isDirty ? connectPort() : port.disconnect());
  editor.dirty.onDataChange(isDirty => debounce(updateDraft, isDirty ? delay : 0));

  prefs.subscribe('editor.autosaveDraft', (key, val) => {
    delay = clamp(val * 1000 | 0, 1000, 2 ** 32 - 1);
    const t = debounce.timers.get(updateDraft);
    if (t != null) debounce(updateDraft, t ? delay : 0);
  }, {runNow: true});

  function connectPort() {
    port = chrome.runtime.connect({name: 'draft:' + makeId()});
  }

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
    if (!isDirty) return;
    API.drafts.put({
      date: Date.now(),
      isUsercss: editor.isUsercss,
      style: editor.getValue(true),
      si: editor.makeScrollInfo(),
    }, makeId());
  }
})();
