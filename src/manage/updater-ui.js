import {kStyleIdPrefix} from '@/js/consts';
import {$create, $detach, $toggleClasses} from '@/js/dom';
import {messageBox, scrollElementIntoView} from '@/js/dom-util';
import {template} from '@/js/localization';
import {onConnect} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import {t} from '@/js/util';
import {filterAndAppend, filtersSelector} from './filters';
import {updateStripes} from './sorter';
import {newUI} from './util';

const elAll = template.updateAll;
const btnApply = elAll.$('#apply-all-updates');
const btnCheck = $id('check-all-updates');
const btnCheckForce = elAll.$('#check-all-updates-force');
const elNoUpdates = elAll.$('#update-all-no-updates');
const elOnlyUpdates = template.onlyUpdates;
btnCheck.onclick = btnCheckForce.onclick = checkUpdateAll;
btnApply.onclick = applyUpdateAll;

for (const el of [...elAll.children]) $detach(el);
for (const id of ['updateAll', 'onlyUpdates']) {
  $(`template[data-id="${id}"]`).replaceWith(template[id]);
}
$detach(elOnlyUpdates);
{
  const kBtns = 'manage.actions.expanded';
  const kOnly = 'updateOnlyEnabled';
  prefs.subscribe([kBtns, kOnly], () => {
    btnCheck.title = btnCheck.title.split('\n')[0] +
      (!prefs.__values[kBtns] && prefs.__values[kOnly] ? `\n(${t('manageOnlyEnabled')})` : '');
  }, true);
}

function applyUpdateAll() {
  btnApply.disabled = true;
  setTimeout(() => {
    $detach(btnApply);
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
  btnCheck.disabled = true;
  $detach(btnCheckForce);
  $detach(btnApply);
  $detach(elNoUpdates);

  const ignoreDigest = this === btnCheckForce;
  $$('.updatable:not(.can-update)' + (ignoreDigest ? '' : ':not(.update-problem)'))
    .forEach(checkUpdate);

  let total = 0;
  let checked = 0;
  let skippedEdited = 0;
  let updated = 0;

  onConnect.updater = port => port.onMessage.addListener(observer);

  API.updater.checkAllStyles({
    save: false,
    observe: true,
    ignoreDigest,
  });

  function observer(info, port) {
    if ('count' in info) {
      total = info.count;
    }
    if (info.updated) {
      if (++updated === 1) {
        btnApply.disabled = true;
      }
      btnApply.dataset.value = updated;
    }
    if (info.updated || 'error' in info) {
      checked++;
      skippedEdited += !info.updated &&
        [info.STATES.EDITED, info.STATES.MAYBE_EDITED].includes(info.error);
      reportUpdateState(info);
    }
    const progress = $id('update-progress');
    const maxWidth = progress.parentElement.clientWidth;
    progress.style.width = Math.round(checked / total * maxWidth) + 'px';

    if (!info.done) return;

    port.onMessage.removeListener(observer);
    document.body.classList.remove('update-in-progress');
    btnCheck.disabled = total === 0;
    btnApply.disabled = false;
    renderUpdatesOnlyFilter({check: updated + skippedEdited > 0});
    if (!updated) {
      elNoUpdates.dataset.skippedEdited = skippedEdited > 0;
      $detach(elNoUpdates, false);
      $detach(btnCheckForce, !skippedEdited);
    }
  }
}

export function checkUpdate(entry, {single} = {}) {
  entry.$('.update-note').textContent = t('checkingForUpdate');
  entry.$('.check-update').title = '';
  if (single) {
    API.updater.checkStyle({
      save: false,
      id: entry.styleId,
      ignoreDigest: entry.classList.contains('update-problem'),
    }).then(reportUpdateState);
  }
  entry.classList.remove('checking-update', 'no-update', 'update-problem');
  entry.classList.add('checking-update');
}

function reportUpdateState({updated, style, error, STATES}) {
  const isCheckAll = document.body.classList.contains('update-in-progress');
  const entry = $id(kStyleIdPrefix + style.id);
  const newClasses = {
    /*
     When a style is updated/installed, handleUpdateInstalled() clears "updatable"
     and sets "update-done" class (optionally "install-done").
     If you don't close the manager and the style is changed remotely,
     checking for updates would find an update so we need to ensure the entry is "updatable"
     */
    'updatable': 1,
    // falsy = remove
    'checking-update': 0,
    'update-done': 0,
    'install-done': 0,
    'no-update': 0,
    'update-problem': 0,
  };
  if (updated) {
    newClasses['can-update'] = true;
    entry.updatedCode = style;
    entry.$('.update-note').textContent = '';
    $detach(elOnlyUpdates, false);
  } else if (!entry.classList.contains('can-update')) {
    const same = (
      error === STATES.SAME_MD5 ||
      error === STATES.SAME_CODE ||
      error === STATES.SAME_VERSION
    );
    const edited = error === STATES.EDITED || error === STATES.MAYBE_EDITED;
    if (!error) {
      error = t('updateCheckFailServerUnreachable') + '\n' + style.updateUrl;
    } else if (typeof error === 'number') {
      error = t('updateCheckFailBadResponseCode', [error]) + '\n' + style.updateUrl;
    } else if (error === STATES.EDITED) {
      error = t('updateCheckSkippedLocallyEdited') + '\n' + t('updateCheckManualUpdateHint');
    } else if (error === STATES.MAYBE_EDITED) {
      error = t('updateCheckSkippedMaybeLocallyEdited') + '\n' + t('updateCheckManualUpdateHint');
    } else if (typeof error === 'object' && error.message) {
      // UserCSS meta errors provide an object
      error = error.message;
    } else if (Array.isArray(error)) {
      // UserCSS build error
      error = error.map(e => `${e.message || e}${
        e.context ? '\n' + e.context.replace(/^/gm, '\t') : '' // indenting source text
      }`).join('\n');
    }
    entry.dataset.error = error;
    const message = same ? t('updateCheckSucceededNoUpdate') : error;
    newClasses['no-update'] = true;
    newClasses['update-problem'] = !same;
    entry.$('.update-note').textContent = message;
    entry.$('.check-update').title = newUI.cfg.enabled ? message : '';
    entry.$('.update').title = t(edited ? 'updateCheckManualUpdateForce' : 'installUpdate');
    // digest may change silently when forcing an update of a locally edited style
    // so we need to update it in entry's styleMeta in all open manager tabs
    if (error === STATES.SAME_CODE) {
      for (const view of chrome.extension.getViews({type: 'tab'})) {
        if (view.location.pathname === location.pathname) {
          const el = view[kStyleIdPrefix + style.id];
          if (el) el.styleMeta.originalDigest = style.originalDigest;
        }
      }
    }
    if (!isCheckAll) {
      renderUpdatesOnlyFilter({show: $('.can-update, .update-problem')});
    }
  }

  $toggleClasses(entry, newClasses);

  if (filtersSelector.hide && isCheckAll) {
    filterAndAppend({entry}).then(updateStripes);
  } else if (updated && !isCheckAll) {
    renderUpdatesOnlyFilter();
  }
}

function renderUpdatesOnlyFilter({show, check} = {}) {
  const numUpdatable = $$('.can-update').length;
  const mightUpdate = numUpdatable > 0 || $('.update-problem');
  const checkbox = elOnlyUpdates.$('input');
  show = show !== undefined ? show : mightUpdate;
  check = check !== undefined ? show && check : checkbox.checked && mightUpdate;

  $detach(elOnlyUpdates, !show);
  checkbox.checked = check && show;
  checkbox.dispatchEvent(new Event('change'));

  $detach(btnApply, !numUpdatable);
  btnApply.dataset.value = numUpdatable;
}

export default async function UpdateHistory(show, el, selector) {
  if (!show) {
    return messageBox.close();
  }
  const log = $create(selector);
  let scroller, toggler;
  let deleted = false;
  const [lines = [], states] = await Promise.all([
    chromeLocal.getValue('updateLog'),
    API.updater.getStates(),
  ]);
  const logText = lines.join('\n');
  await messageBox.show({
    title: t('updateCheckHistory'),
    className: 'center-dialog',
    contents: log,
    blockScroll: true,
    buttons: [
      t('confirmOK'),
      logText && {textContent: t('confirmDelete'), onclick: deleteHistory},
    ],
    onshow: logText && (() => {
      scroller = $id('message-box-contents');
      scroller.tabIndex = 0;
      setTimeout(() => scroller.focus());
      scrollToBottom();

      $('#message-box-buttons button').insertAdjacentElement('afterend',
        // TODO: add a <template> or a common function to create such controls
        $create('label', [
          toggler = $create('input', {type: 'checkbox', checked: true, onchange: toggleSkipped}),
          t('manageOnlyUpdates'),
        ]));

      toggler.rxRemoveNOP = new RegExp(
        '^[^#]*(' +
        Object.keys(states)
          .filter(k => k.startsWith('SAME_'))
          .map(k => states[k])
          .join('|') +
        ').*\r?\n', 'gm');
      toggler.onchange();
    }),
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
    log.textContent = !this.checked ? logText : logText.replace(this.rxRemoveNOP, '');
    if (Math.abs(scrollRatio - calcScrollRatio()) > .1) {
      scroller.scrollTop = scrollRatio * scroller.scrollHeight - scroller.clientHeight;
    }
  }

  function deleteHistory() {
    if (deleted) {
      chromeLocal.set({updateLog: logText.split('\n')});
      setTimeout(scrollToBottom);
    } else {
      chromeLocal.remove('updateLog');
      log.textContent = '';
    }
    deleted = !deleted;
    toggler.onchange();
    this.textContent = t(deleted ? 'undo' : 'confirmDelete');
  }
}

export function handleUpdateInstalled(entry, reason) {
  const isNew = reason === 'install';
  const note = t(isNew ? 'installButtonInstalled' : 'updateCompleted');
  entry.classList.add('update-done', ...(isNew ? ['install-done'] : []));
  entry.classList.remove('can-update', 'updatable');
  entry.$('.update-note').textContent = note;
  entry.$('.updated').title = note;
  renderUpdatesOnlyFilter();
}
