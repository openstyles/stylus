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
      $('#only-updates').classList.remove('hidden');
      break;
    case BG.updater.SKIPPED: {
      if (entry.classList.contains('can-update')) {
        break;
      }
      const same = (
        details === BG.updater.SAME_MD5 ||
        details === BG.updater.SAME_CODE ||
        details === BG.updater.SAME_VERSION
      );
      const edited = details === BG.updater.EDITED || details === BG.updater.MAYBE_EDITED;
      entry.dataset.details = details;
      if (!details) {
        details = t('updateCheckFailServerUnreachable') + '\n' + style.updateUrl;
      } else if (typeof details === 'number') {
        details = t('updateCheckFailBadResponseCode', [details]) + '\n' + style.updateUrl;
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
  const checkbox = $('#only-updates input');
  show = show !== undefined ? show : mightUpdate;
  check = check !== undefined ? show && check : checkbox.checked && mightUpdate;

  $('#only-updates').classList.toggle('hidden', !show);
  checkbox.checked = check && show;
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


function showUpdateHistory(event) {
  event.preventDefault();
  const log = $create('.update-history-log');
  let logText, scroller, toggler;
  let deleted = false;
  BG.chromeLocal.getValue('updateLog').then((lines = []) => {
    logText = lines.join('\n');
    messageBox({
      title: t('updateCheckHistory'),
      contents: log,
      buttons: [
        t('confirmOK'),
        logText && {textContent: t('confirmDelete'), onclick: deleteHistory},
      ],
      onshow: logText && (() => {
        scroller = $('#message-box-contents');
        scroller.setAttribute('tabindex', 0);
        scroller.focus();
        scrollToBottom();
        $('#message-box-buttons button').insertAdjacentElement('afterend',
          // TODO: add a global class for our labels
          // TODO: add a <template> or a common function to create such controls
          $create('label', {style: 'position: relative; padding-left: 16px;'}, [
            toggler =
            $create('input', {type: 'checkbox', checked: true, onchange: toggleSkipped}),
            $create('SVG:svg.svg-icon.checked',
              $create('SVG:use', {'xlink:href': '#svg-icon-checked'})),
            t('manageOnlyUpdates'),
          ]));
        toggler.onchange();
      }),
      blockScroll: true
    });
  });
  function scrollToBottom() {
    scroller.scrollTop = 1e9;
  }
  function calcScrollRatio() {
    return (scroller.scrollTop + scroller.clientHeight) / scroller.scrollHeight;
  }
  function toggleSkipped() {
    if (deleted) {
      return;
    }
    const scrollRatio = calcScrollRatio();
    const rxRemoveNOP = this.checked && new RegExp([
      '^[^#]*(',
      Object.keys(BG.updater)
        .filter(k => k.startsWith('SAME_'))
        .map(k => stringAsRegExp(BG.updater[k]))
        .map(rx => rx.source)
        .join('|'),
      ').*\r?\n',
    ].join(''), 'gm');
    log.textContent = !this.checked ? logText : logText.replace(rxRemoveNOP, '');
    if (Math.abs(scrollRatio - calcScrollRatio()) > .1) {
      scroller.scrollTop = scrollRatio * scroller.scrollHeight - scroller.clientHeight;
    }
  }
  function deleteHistory() {
    if (deleted) {
      BG.chromeLocal.setValue('updateLog', logText.split('\n'));
      setTimeout(scrollToBottom);
    } else {
      BG.chromeLocal.remove('updateLog');
      log.textContent = '';
    }
    deleted = !deleted;
    toggler.onchange();
    this.textContent = t(deleted ? 'undo' : 'confirmDelete');
  }
}


function handleUpdateInstalled(entry, reason) {
  const isNew = reason === 'install';
  const note = t(isNew ? 'installButtonInstalled' : 'updateCompleted');
  entry.classList.add('update-done', ...(isNew ? ['install-done'] : []));
  entry.classList.remove('can-update', 'updatable');
  $('.update-note', entry).textContent = note;
  $('.updated', entry).title = note;
  renderUpdatesOnlyFilter();
}
