import {kStyleIdPrefix, UCD} from '@/js/consts';
import {$toggleClasses} from '@/js/dom';
import {
  animateElement, configDialog, getEventKeyName, messageBox, scrollElementIntoView, setHocus,
} from '@/js/dom-util';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {sessionStore, t} from '@/js/util';
import {browserWindows, getOwnTab} from '@/js/util-webext';
import {filterAndAppend, showFiltersStats} from './filters';
import {createStyleElement, createTargetsElement, renderFavs, updateTotal} from './render';
import * as sorter from './sorter';
import {checkUpdate, handleUpdateInstalled} from './updater-ui';
import {installed, newUI, objectDiff, queue, styleToDummyEntry} from './util';

for (const a of $$('#header a[href^="http"]')) a.onclick = openLink;
installed.on('click', onEntryClicked);
installed.on('contextmenu', onEntryClicked);
window.on('pageshow', handleVisibilityChange);
window.on('pagehide', handleVisibilityChange);
onMessage.set(m => {
  switch (m.method) {
    case 'styleUpdated':
    case 'styleAdded':
    case 'styleDeleted':
      queue.push(m);
      queue.p ??= Promise.resolve().then(handleBulkChange);
  }
});

const SEL_EXPANDER = '.applies-to .expander';
const ENTRY_ROUTES = {

  'input, .enable, .disable'(event, entry) {
    API.styles.toggle(entry.styleId, this.matches('.enable') || this.checked);
  },

  '.style-name'(event, entry) {
    if (newUI.cfg.enabled && !event.target.closest('.homepage')) {
      edit(event, entry);
    }
  },

  '.homepage': openLink,

  '.check-update'(event, entry) {
    checkUpdate(entry, {single: true});
  },

  '.update'(event, entry) {
    const json = entry.updatedCode;
    json.id = entry.styleId;
    (json[UCD] ? API.usercss.install : API.styles.install)(json);
  },

  async '.delete'(event, entry) {
    const id = entry.styleId;
    animateElement(entry);
    const {button} = await messageBox.show({
      title: t('deleteStyleConfirm'),
      contents: entry.styleMeta.customName || entry.styleMeta.name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    });
    if (button === 0) {
      API.styles.remove(id);
    }
    setHocus($('#message-box-buttons > button'), false);
  },

  '.configure-usercss'(event, {styleId}) {
    configDialog(styleId);
  },

  [SEL_EXPANDER]: expandTargets,
};

const ENTRY_ROUTES_CTX = {
  [SEL_EXPANDER]: expandTargets,
};

async function edit(event, entry) {
  if (event.altKey) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const key = getEventKeyName(event);
  const url = entry.$('[href]').href;
  const ownTab = await getOwnTab();
  if (key === 'MouseL') {
    sessionStore['manageStylesHistory' + ownTab.id] = url;
    location.href = url;
  } else if (browserWindows && key === 'Shift-MouseL') {
    API.openEditor({id: entry.styleId});
  } else {
    API.openURL({
      url,
      index: ownTab.index + 1,
      active: key === 'Shift-MouseM' || key === 'Shift-Ctrl-MouseL',
    });
  }
}

function expandTargets(event, entry) {
  if (event.type === 'contextmenu') {
    event.preventDefault();
    const ex = '.expanded';
    $$(`.has-more${entry.$(ex) ? ex : `:not(${ex})`} .expander`)
      .forEach(el => el.click());
    return;
  }
  if (!entry._allTargetsRendered) {
    createTargetsElement({entry, expanded: true});
    renderFavs(entry);
  }
  this.closest('.applies-to').classList.toggle('expanded');
}

export async function openLink(event) {
  // Not handling Shift-click - the built-in 'open in a new window' command
  if (getEventKeyName(event) !== 'Shift-MouseL') {
    event.preventDefault(); // Prevent FF from double-handling the event
    const {index} = await getOwnTab();
    API.openURL({
      url: event.target.closest('a').href,
      index: index + 1,
      active: !event.ctrlKey || event.shiftKey,
    });
  }
}

export function onEntryClicked(event) {
  const target = event.target;
  const entry = target.closest('.entry');
  const routes = event.type === 'contextmenu' ? ENTRY_ROUTES_CTX : ENTRY_ROUTES;
  for (const selector in routes) {
    for (let el = target; el && el !== entry; el = el.parentElement) {
      if (el.matches(selector)) {
        return routes[selector].call(el, event, entry);
      }
    }
  }
}

export function handleBulkChange() {
  for (const msg of queue) {
    const {id} = msg.style;
    let fullStyle;
    if (msg.method === 'styleDeleted') {
      handleDelete(id);
    } else if (msg.reason === 'import' && (fullStyle = queue.styles.get(id))) {
      handleUpdate(fullStyle, msg);
      queue.styles.delete(id);
    } else {
      handleUpdateForId(id, msg);
    }
  }
  sorter.updateStripes({onlyWhenColumnsChanged: true});
  queue.p = null;
  queue.length = 0;
}

function handleDelete(id) {
  const node = $id(kStyleIdPrefix + id);
  if (node) {
    node.remove();
    if (node.matches('.can-update')) {
      const btnApply = $id('apply-all-updates');
      btnApply.dataset.value = Number(btnApply.dataset.value) - 1;
    }
    showFiltersStats();
    updateTotal(-1);
  }
}

function handleUpdate(style, {reason, method} = {}) {
  if (reason === 'editPreview' || reason === 'editPreviewEnd') return;
  let entry;
  let oldEntry = $id(kStyleIdPrefix + style.id);
  if (oldEntry && method === 'styleUpdated') {
    handleToggledOrCodeOnly();
  }
  entry = entry || createStyleElement(styleToDummyEntry(style));
  if (oldEntry) {
    if (oldEntry.styleNameLC === entry.styleNameLC) {
      installed.replaceChild(entry, oldEntry);
    } else {
      oldEntry.remove();
    }
  } else {
    updateTotal(1);
  }
  if ((reason === 'update' || reason === 'install') && entry.matches('.updatable')) {
    handleUpdateInstalled(entry, reason);
  }
  filterAndAppend({entry}).then(sorter.update);
  if (!entry.matches('.hidden') && reason !== 'import' && reason !== 'sync') {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
  renderFavs(entry);

  function handleToggledOrCodeOnly() {
    const diff = objectDiff(oldEntry.styleMeta, style)
      .filter(({key, path}) => path || !/^_|(Date|Digest|Md5)$/.test(key));
    if (diff.length === 0) {
      // only code was modified
      entry = oldEntry;
      oldEntry = null;
    }
    if (diff.length === 1 && diff[0].key === 'enabled') {
      const isOn = style.enabled;
      $toggleClasses(oldEntry, {enabled: isOn, disabled: !isOn});
      for (const el of oldEntry.$$('input')) el.checked = isOn;
      oldEntry.styleMeta = style;
      entry = oldEntry;
      oldEntry = null;
    }
  }
}

async function handleUpdateForId(id, opts) {
  handleUpdate(await API.styles.getCore({id, sections: true, size: true}), opts);
}

export function handleVisibilityChange(e) {
  const id = Number(sessionStore.justEditedStyleId);
  if (e.type === 'pageshow' && e.persisted && id) {
    // TODO: update all elements in-place, not just the last edited style
    handleUpdateForId(id, {method: 'styleUpdated'});
    delete sessionStore.justEditedStyleId;
  } else if (e.type === 'pagehide') {
    history.replaceState({scrollY: window.scrollY}, document.title);
  }
}
