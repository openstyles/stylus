/* global API */// msg.js
/* global changeQueue installed newUI */// manage.js
/* global checkUpdate handleUpdateInstalled */// updater-ui.js
/* global createStyleElement createTargetsElement getFaviconSrc */// render.js
/* global debounce getOwnTab openURL sessionStore */// toolbox.js
/* global filterAndAppend showFiltersStats */// filters.js
/* global sorter */
/* global t */// localization.js
/* global
  $
  $$
  $entry
  animateElement
  getEventKeyName
  messageBoxProxy
  scrollElementIntoView
*/// dom.js
'use strict';

const Events = {

  addEntryTitle(link) {
    const style = link.closest('.entry').styleMeta;
    const ucd = style.usercssData;
    link.title =
      `${t('dateInstalled')}: ${t.formatDate(style.installDate, true) || '—'}\n` +
      `${t('dateUpdated')}: ${t.formatDate(style.updateDate, true) || '—'}\n` +
      (ucd ? `UserCSS, v.${ucd.version}` : '');
  },

  check(event, entry) {
    checkUpdate(entry, {single: true});
  },

  async config(event, {styleMeta}) {
    await require(['/js/dlg/config-dialog']); /* global configDialog */
    configDialog(styleMeta);
  },

  async delete(event, entry) {
    const id = entry.styleId;
    animateElement(entry);
    const {button} = await messageBoxProxy.show({
      title: t('deleteStyleConfirm'),
      contents: entry.styleMeta.customName || entry.styleMeta.name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    });
    if (button === 0) {
      API.styles.delete(id);
    }
    const deleteButton = $('#message-box-buttons > button');
    if (deleteButton) deleteButton.removeAttribute('data-focused-via-click');
  },

  async edit(event, entry) {
    if (event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const key = getEventKeyName(event);
    const url = $('[href]', entry).href;
    const ownTab = await getOwnTab();
    if (key === 'MouseL') {
      sessionStore['manageStylesHistory' + ownTab.id] = url;
      location.href = url;
    } else if (chrome.windows && key === 'Shift-MouseL') {
      API.openEditor({id: entry.styleId});
    } else {
      openURL({
        url,
        index: ownTab.index + 1,
        active: key === 'Shift-MouseM' || key === 'Shift-Ctrl-MouseL',
      });
    }
  },

  expandTargets(event, entry) {
    if (!entry._allTargetsRendered) {
      createTargetsElement({entry, expanded: true});
      setTimeout(getFaviconSrc, 0, entry);
    }
    this.closest('.applies-to').classList.toggle('expanded');
  },

  async external(event) {
    // Not handling Shift-click - the built-in 'open in a new window' command
    if (getEventKeyName(event) !== 'Shift-MouseL') {
      event.preventDefault(); // Prevent FF from double-handling the event
      const {index} = await getOwnTab();
      openURL({
        url: event.target.closest('a').href,
        index: index + 1,
        active: !event.ctrlKey || event.shiftKey,
      });
    }
  },

  entryClicked(event) {
    const target = event.target;
    const entry = target.closest('.entry');
    for (const selector in Events.ENTRY_ROUTES) {
      for (let el = target; el && el !== entry; el = el.parentElement) {
        if (el.matches(selector)) {
          return Events.ENTRY_ROUTES[selector].call(el, event, entry);
        }
      }
    }
  },

  lazyAddEntryTitle({type, target}) {
    const cell = target.closest('h2.style-name, [data-type=age]');
    if (cell) {
      const link = $('.style-name-link', cell) || cell;
      if (type === 'mouseover' && !link.title) {
        debounce(Events.addEntryTitle, 50, link);
      } else {
        debounce.unregister(Events.addEntryTitle);
      }
    }
  },

  name(event, entry) {
    if (newUI.enabled) Events.edit(event, entry);
  },

  toggle(event, entry) {
    API.styles.toggle(entry.styleId, this.matches('.enable') || this.checked);
  },

  update(event, entry) {
    const json = entry.updatedCode;
    json.id = entry.styleId;
    (json.usercssData ? API.usercss.install : API.styles.install)(json);
  },
};

Events.ENTRY_ROUTES = {
  'input, .enable, .disable': Events.toggle,
  '.style-name': Events.name,
  '.homepage': Events.external,
  '.check-update': Events.check,
  '.update': Events.update,
  '.delete': Events.delete,
  '.applies-to .expander': Events.expandTargets,
  '.configure-usercss': Events.config,
};

/* exported handleBulkChange */
function handleBulkChange() {
  for (const msg of changeQueue) {
    const {id} = msg.style;
    if (msg.method === 'styleDeleted') {
      handleDelete(id);
      changeQueue.time = performance.now();
    } else {
      handleUpdateForId(id, msg);
    }
  }
  changeQueue.length = 0;
}

function handleDelete(id) {
  const node = $entry(id);
  if (node) {
    node.remove();
    if (node.matches('.can-update')) {
      const btnApply = $('#apply-all-updates');
      btnApply.dataset.value = Number(btnApply.dataset.value) - 1;
    }
    showFiltersStats();
  }
}

function handleUpdate(style, {reason, method} = {}) {
  if (reason === 'editPreview' || reason === 'editPreviewEnd') return;
  let entry;
  let oldEntry = $entry(style);
  if (oldEntry && method === 'styleUpdated') {
    handleToggledOrCodeOnly();
  }
  entry = entry || createStyleElement({style});
  if (oldEntry) {
    if (oldEntry.styleNameLowerCase === entry.styleNameLowerCase) {
      installed.replaceChild(entry, oldEntry);
    } else {
      oldEntry.remove();
    }
  }
  if ((reason === 'update' || reason === 'install') && entry.matches('.updatable')) {
    handleUpdateInstalled(entry, reason);
  }
  filterAndAppend({entry}).then(sorter.update);
  if (!entry.matches('.hidden') && reason !== 'import' && reason !== 'sync') {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
  getFaviconSrc(entry);

  function handleToggledOrCodeOnly() {
    style.sections.forEach(s => (s.code = null));
    style.sourceCode = null;
    const diff = objectDiff(oldEntry.styleMeta, style)
      .filter(({key, path}) => path || (!key.startsWith('original') && !key.endsWith('Date')));
    if (diff.length === 0) {
      // only code was modified
      entry = oldEntry;
      oldEntry = null;
    }
    if (diff.length === 1 && diff[0].key === 'enabled') {
      oldEntry.classList.toggle('enabled', style.enabled);
      oldEntry.classList.toggle('disabled', !style.enabled);
      $$('input', oldEntry).forEach(el => (el.checked = style.enabled));
      oldEntry.styleMeta = style;
      entry = oldEntry;
      oldEntry = null;
    }
  }
}

async function handleUpdateForId(id, opts) {
  handleUpdate(await API.styles.get(id), opts);
  changeQueue.time = performance.now();
}

/* exported handleVisibilityChange */
function handleVisibilityChange() {
  switch (document.visibilityState) {
    // page restored without reloading via history navigation (currently only in FF)
    // the catch here is that DOM may be outdated so we'll at least refresh the just edited style
    // assuming other changes aren't important enough to justify making a complicated DOM sync
    case 'visible': {
      const id = sessionStore.justEditedStyleId;
      if (id) {
        handleUpdateForId(Number(id), {method: 'styleUpdated'});
        delete sessionStore.justEditedStyleId;
      }
      break;
    }
    // going away
    case 'hidden':
      history.replaceState({scrollY: window.scrollY}, document.title);
      break;
  }
}

function objectDiff(first, second, path = '') {
  const diff = [];
  for (const key in first) {
    const a = first[key];
    const b = second[key];
    if (a === b) {
      continue;
    }
    if (b === undefined) {
      diff.push({path, key, values: [a], type: 'removed'});
      continue;
    }
    if (a && typeof a.filter === 'function' && b && typeof b.filter === 'function') {
      if (
        a.length !== b.length ||
        a.some((el, i) => {
          const result = !el || typeof el !== 'object'
            ? el !== b[i]
            : objectDiff(el, b[i], path + key + '[' + i + '].').length;
          return result;
        })
      ) {
        diff.push({path, key, values: [a, b], type: 'changed'});
      }
    } else if (typeof a === 'object' && typeof b === 'object') {
      diff.push(...objectDiff(a, b, path + key + '.'));
    } else {
      diff.push({path, key, values: [a, b], type: 'changed'});
    }
  }
  for (const key in second) {
    if (!(key in first)) {
      diff.push({path, key, values: [second[key]], type: 'added'});
    }
  }
  return diff;
}
