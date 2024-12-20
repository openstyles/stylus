import {$, $$, $create} from '@/js/dom';
import {messageBox, scrollElementIntoView} from '@/js/dom-util';
import {t} from '@/js/localization';
import {API} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import {filterAndAppend, filtersSelector} from './filters';
import {updateStripes} from './sorter';
import {$entry, newUI} from './util';

const btnCheck = $('#check-all-updates');
const btnCheckForce = $('#check-all-updates-force');
const btnApply = $('#apply-all-updates');
btnCheck.onclick = btnCheckForce.onclick = checkUpdateAll;
btnApply.onclick = applyUpdateAll;

prefs.subscribe('updateOnlyEnabled', (key, val) => {
  btnCheck.title = val ? t('manageOnlyEnabled') : '';
}, true);

function applyUpdateAll() {
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
  const noUpdates = $('#update-all-no-updates');
  btnCheck.disabled = true;
  btnCheckForce.classList.add('hidden');
  btnApply.classList.add('hidden');
  noUpdates.classList.add('hidden');

  const ignoreDigest = this === btnCheckForce;
  $$('.updatable:not(.can-update)' + (ignoreDigest ? '' : ':not(.update-problem)'))
    .forEach(checkUpdate);

  let total = 0;
  let checked = 0;
  let skippedEdited = 0;
  let updated = 0;

  chrome.runtime.onConnect.addListener(function onConnect(port) {
    if (port.name !== 'updater') return;
    port.onMessage.addListener(observer);
    chrome.runtime.onConnect.removeListener(onConnect);
  });

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
    const progress = $('#update-progress');
    const maxWidth = progress.parentElement.clientWidth;
    progress.style.width = Math.round(checked / total * maxWidth) + 'px';

    if (!info.done) return;

    port.onMessage.removeListener(observer);
    document.body.classList.remove('update-in-progress');
    btnCheck.disabled = total === 0;
    btnApply.disabled = false;
    renderUpdatesOnlyFilter({check: updated + skippedEdited > 0});
    if (!updated) {
      noUpdates.dataset.skippedEdited = skippedEdited > 0;
      noUpdates.classList.remove('hidden');
      btnCheckForce.classList.toggle('hidden', skippedEdited === 0);
    }
  }
}

export function checkUpdate(entry, {single} = {}) {
  $('.update-note', entry).textContent = t('checkingForUpdate');
  $('.check-update', entry).title = '';
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
  const entry = $entry(style);
  const newClasses = new Map([
    /*
     When a style is updated/installed, handleUpdateInstalled() clears "updatable"
     and sets "update-done" class (optionally "install-done").
     If you don't close the manager and the style is changed remotely,
     checking for updates would find an update so we need to ensure the entry is "updatable"
     */
    ['updatable', true],
    // falsy = remove
    ['checking-update', 0],
    ['update-done', 0],
    ['install-done', 0],
    ['no-update', 0],
    ['update-problem', 0],
  ]);
  if (updated) {
    newClasses.set('can-update', true);
    entry.updatedCode = style;
    $('.update-note', entry).textContent = '';
    $('#only-updates').classList.remove('hidden');
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
    newClasses.set('no-update', true);
    newClasses.set('update-problem', !same);
    $('.update-note', entry).textContent = message;
    $('.check-update', entry).title = newUI.cfg.enabled ? message : '';
    $('.update', entry).title = t(edited ? 'updateCheckManualUpdateForce' : 'installUpdate');
    // digest may change silently when forcing an update of a locally edited style
    // so we need to update it in entry's styleMeta in all open manager tabs
    if (error === STATES.SAME_CODE) {
      for (const view of chrome.extension.getViews({type: 'tab'})) {
        if (view.location.pathname === location.pathname) {
          const el = $entry(style, view.document);
          if (el) el.styleMeta.originalDigest = style.originalDigest;
        }
      }
    }
    if (!isCheckAll) {
      renderUpdatesOnlyFilter({show: $('.can-update, .update-problem')});
    }
  }

  // construct a new className:
  // 1. add all truthy newClasses
  // 2. remove falsy newClasses
  // 3. keep existing classes otherwise
  const classes = new Map([...entry.classList.values()].map(cls => [cls, true]));
  for (const [cls, newState] of newClasses) {
    classes.set(cls, newState);
  }
  const className = [...classes]
    .map(([cls, state]) => state && cls)
    .filter(Boolean)
    .join(' ');
  if (className !== entry.className) {
    entry.className = className;
  }

  if (filtersSelector.hide && isCheckAll) {
    filterAndAppend({entry}).then(updateStripes);
  } else if (updated && !isCheckAll) {
    renderUpdatesOnlyFilter();
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

  btnApply.classList.toggle('hidden', !numUpdatable);
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
      scroller = $('#message-box-contents');
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
      chromeLocal.setValue('updateLog', logText.split('\n'));
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
  $('.update-note', entry).textContent = note;
  $('.updated', entry).title = note;
  renderUpdatesOnlyFilter();
}
