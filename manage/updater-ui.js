/* global messageBox */
/* global ENTRY_ID_PREFIX, newUI */
/* global filtersSelector, filterAndAppend */
'use strict';

onDOMready().then(() => {
  $('#check-all-updates').onclick = checkUpdateAll;
  $('#check-all-updates-force').onclick = checkUpdateAll;
  $('#apply-all-updates').onclick = applyUpdateAll;
  $('#update-history').onclick = showUpdateHistory;
});


function applyUpdateAll() {
  const btnApply = $('#apply-all-updates');
  btnApply.disabled = true;
  setTimeout(() => {
    btnApply.classList.add('hidden');
    btnApply.disabled = false;
    renderUpdatesOnlyFilter({show: false});
  }, 1000);

  $$('.can-update .update').forEach(button => {
    scrollElementIntoView(button);
    button.click();
  });
}


function checkUpdateAll() {
  document.body.classList.add('update-in-progress');
  $('#check-all-updates').disabled = true;
  $('#check-all-updates-force').classList.add('hidden');
  $('#apply-all-updates').classList.add('hidden');
  $('#update-all-no-updates').classList.add('hidden');

  const ignoreDigest = this && this.id === 'check-all-updates-force';
  $$('.updatable:not(.can-update)' + (ignoreDigest ? '' : ':not(.update-problem)'))
    .map(el => checkUpdate(el, {single: false}));

  let total = 0;
  let checked = 0;
  let skippedEdited = 0;
  let updated = 0;

  BG.updater.checkAllStyles({observer, save: false, ignoreDigest}).then(done);

  function observer(state, value, details) {
    switch (state) {
      case BG.updater.COUNT:
        total = value;
        break;
      case BG.updater.UPDATED:
        if (++updated === 1) {
          $('#apply-all-updates').disabled = true;
          $('#apply-all-updates').classList.remove('hidden');
        }
        $('#apply-all-updates').dataset.value = updated;
        // fallthrough
      case BG.updater.SKIPPED:
        checked++;
        if (details === BG.updater.EDITED || details === BG.updater.MAYBE_EDITED) {
          skippedEdited++;
        }
        reportUpdateState(state, value, details);
        break;
    }
    const progress = $('#update-progress');
    const maxWidth = progress.parentElement.clientWidth;
    progress.style.width = Math.round(checked / total * maxWidth) + 'px';
  }

  function done() {
    document.body.classList.remove('update-in-progress');
    $('#check-all-updates').disabled = total === 0;
    $('#apply-all-updates').disabled = false;
    renderUpdatesOnlyFilter({check: updated + skippedEdited > 0});
    if (!updated) {
      $('#update-all-no-updates').dataset.skippedEdited = skippedEdited > 0;
      $('#update-all-no-updates').classList.remove('hidden');
      $('#check-all-updates-force').classList.toggle('hidden', skippedEdited === 0);
    }
  }
}


function checkUpdate(entry, {single = true} = {}) {
  $('.update-note', entry).textContent = t('checkingForUpdate');
  $('.check-update', entry).title = '';
  if (single) {
    BG.updater.checkStyle({
      save: false,
      ignoreDigest: entry.classList.contains('update-problem'),
      style: BG.cachedStyles.byId.get(entry.styleId),
      observer: reportUpdateState,
    });
  }
  entry.classList.remove('checking-update', 'no-update', 'update-problem');
  entry.classList.add('checking-update');
}


function reportUpdateState(state, style, details) {
  const entry = $(ENTRY_ID_PREFIX + style.id);
  entry.classList.remove('checking-update');
  switch (state) {
    case BG.updater.UPDATED:
      entry.classList.add('can-update');
      entry.updatedCode = style;
      $('.update-note', entry).textContent = '';
      $('#onlyUpdates').classList.remove('hidden');
      break;
    case BG.updater.SKIPPED: {
      if (entry.classList.contains('can-update')) {
        break;
      }
      const same = details === BG.updater.SAME_MD5 || details === BG.updater.SAME_CODE;
      const edited = details === BG.updater.EDITED || details === BG.updater.MAYBE_EDITED;
      entry.dataset.details = details;
      if (!details) {
        details = t('updateCheckFailServerUnreachable');
      } else if (typeof details === 'number') {
        details = t('updateCheckFailBadResponseCode', [details]);
      } else if (details === BG.updater.EDITED) {
        details = t('updateCheckSkippedLocallyEdited') + '\n' + t('updateCheckManualUpdateHint');
      } else if (details === BG.updater.MAYBE_EDITED) {
        details = t('updateCheckSkippedMaybeLocallyEdited') + '\n' + t('updateCheckManualUpdateHint');
      }
      const message = same ? t('updateCheckSucceededNoUpdate') : details;
      entry.classList.add('no-update');
      entry.classList.toggle('update-problem', !same);
      $('.update-note', entry).textContent = message;
      $('.check-update', entry).title = newUI.enabled ? message : '';
      $('.update', entry).title = t(edited ? 'updateCheckManualUpdateForce' : 'installUpdate');
      if (!document.body.classList.contains('update-in-progress')) {
        // this is a single update job so we can decide whether to hide the filter
        renderUpdatesOnlyFilter({show: $('.can-update, .update-problem')});
      }
    }
  }
  if (filtersSelector.hide) {
    filterAndAppend({entry});
  }
}


function renderUpdatesOnlyFilter({show, check} = {}) {
  const numUpdatable = $$('.can-update').length;
  const mightUpdate = numUpdatable > 0 || $('.update-problem');
  const checkbox = $('#onlyUpdates input');
  show = show !== undefined ? show : mightUpdate;
  check = check !== undefined ? show && check : checkbox.checked && mightUpdate;

  $('#onlyUpdates').classList.toggle('hidden', !show);
  checkbox.checked = check;
  checkbox.dispatchEvent(new Event('change'));

  const btnApply = $('#apply-all-updates');
  if (!btnApply.matches('.hidden')) {
    if (numUpdatable > 0) {
      btnApply.dataset.value = numUpdatable;
    } else {
      btnApply.classList.add('hidden');
    }
  }
}


function showUpdateHistory() {
  BG.chromeLocal.getValue('updateLog').then((lines = []) => {
    messageBox({
      title: t('updateCheckHistory'),
      contents: $element({
        className: 'update-history-log',
        textContent: lines.join('\n'),
      }),
      buttons: [t('confirmOK')],
      onshow: () => ($('#message-box-contents').scrollTop = 1e9),
    });
  });
}


function handleUpdateInstalled(entry) {
  entry.classList.add('update-done');
  entry.classList.remove('can-update', 'updatable');
  $('.update-note', entry).textContent = t('updateCompleted');
  renderUpdatesOnlyFilter();
}
