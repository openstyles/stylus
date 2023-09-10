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
  }, {runNow: true});

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
    const info = t('draftTitle', makeRelativeDate(draft.date));
    const popup = showCodeMirrorPopup(info, '', {value, readOnly: true});
    popup.className += ' danger';
    window.on('closeHelp', onNo, {once: true});
    helpPopup.contents.append(
      $create('p', t('draftAction')),
      $create('.buttons', [t('confirmYes'), t('confirmNo')].map((btn, i) =>
        $create('button', {textContent: btn, onclick: i ? onNo : onYes})))
    );
    if (await new Promise(r => (resolve = r))) {
      await editor.replaceStyle(style, draft);
    } else {
      API.drafts.delete(makeId()).catch(() => {});
    }
    window.off('closeHelp', onNo);
    helpPopup.close();
  }

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
