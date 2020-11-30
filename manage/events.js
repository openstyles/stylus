'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {
    debounce,
    getOwnTab,
    getStyleWithNoCode,
    openURL,
    sessionStore,
  } = require('/js/toolbox');
  const t = require('/js/localization');
  const {
    $,
    $$,
    animateElement,
    messageBoxProxy,
    scrollElementIntoView,
  } = require('/js/dom');
  const newUI = require('./new-ui');
  const {
    bulkChangeQueue,
    $entry,
    createStyleElement,
    createStyleTargetsElement,
    getFaviconImgSrc,
  } = require('./render');
  const sorter = require('./sorter');
  const filters = require('./filters');

  let updaterUI;
  require(['./updater-ui'], res => (updaterUI = res));

  const REVEAL_DATES_FOR = 'h2.style-name, [data-type=age]';

  const Events = {

    ENTRY_ROUTES: {
      'input, .enable, .disable': 'toggle',
      '.style-name': 'name',
      '.homepage': 'external',
      '.check-update': 'check',
      '.update': 'update',
      '.delete': 'delete',
      '.applies-to .expander': 'expandTargets',
      '.configure-usercss': 'config',
    },

    addEntryTitle(link) {
      const style = link.closest('.entry').styleMeta;
      const ucd = style.usercssData;
      link.title =
        `${t('dateInstalled')}: ${t.formatDate(style.installDate) || '—'}\n` +
        `${t('dateUpdated')}: ${t.formatDate(style.updateDate) || '—'}\n` +
        (ucd ? `UserCSS, v.${ucd.version}` : '');
    },

    check(event, entry) {
      updaterUI.checkUpdate(entry, {single: true});
    },

    async config(event, {styleMeta}) {
      (await require(['/js/dlg/config-dialog']))(styleMeta);
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
      const key = `${event.shiftKey ? 's' : ''}${event.ctrlKey ? 'c' : ''}${'LMR'[event.button]}`;
      const url = $('[href]', entry).href;
      const ownTab = await getOwnTab();
      if (key === 'L') {
        sessionStore['manageStylesHistory' + ownTab.id] = url;
        location.href = url;
      } else if (chrome.windows && key === 'sL') {
        API.openEditor({id: entry.styleId});
      } else {
        openURL({
          url,
          index: ownTab.index + 1,
          active: key === 'sM' || key === 'scL',
        });
      }
    },

    expandTargets(event, entry) {
      if (!entry._allTargetsRendered) {
        createStyleTargetsElement({entry, expanded: true});
        setTimeout(getFaviconImgSrc, 0, entry);
      }
      this.closest('.applies-to').classList.toggle('expanded');
    },

    external(event) {
      if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        // Shift-click = the built-in 'open in a new window' action
        return;
      }
      getOwnTab().then(({index}) => {
        openURL({
          url: event.target.closest('a').href,
          index: index + 1,
          active: !event.ctrlKey || event.shiftKey,
        });
      });
    },

    entryClicked(event) {
      const target = event.target;
      const entry = target.closest('.entry');
      for (const selector in Events.ENTRY_ROUTES) {
        for (let el = target; el && el !== entry; el = el.parentElement) {
          if (el.matches(selector)) {
            const handler = Events.ENTRY_ROUTES[selector];
            return Events[handler].call(el, event, entry);
          }
        }
      }
    },

    lazyAddEntryTitle({type, target}) {
      const cell = target.closest(REVEAL_DATES_FOR);
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
      (json.usercssData ? API.usercss : API.styles).install(json);
    },
  };

  async function handleUpdateForId(id, opts) {
    handleUpdate(await API.styles.get(id), opts);
    bulkChangeQueue.time = performance.now();
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
        $('#installed').replaceChild(entry, oldEntry);
      } else {
        oldEntry.remove();
      }
    }
    if ((reason === 'update' || reason === 'install') && entry.matches('.updatable')) {
      updaterUI.handleUpdateInstalled(entry, reason);
    }
    filters.filterAndAppend({entry}).then(sorter.update);
    if (!entry.matches('.hidden') && reason !== 'import' && reason !== 'sync') {
      animateElement(entry);
      requestAnimationFrame(() => scrollElementIntoView(entry));
    }
    getFaviconImgSrc(entry);

    function handleToggledOrCodeOnly() {
      const newStyleMeta = getStyleWithNoCode(style);
      const diff = objectDiff(oldEntry.styleMeta, newStyleMeta)
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
        oldEntry.styleMeta = newStyleMeta;
        entry = oldEntry;
        oldEntry = null;
      }
    }
  }

  function handleDelete(id) {
    const node = $entry(id);
    if (node) {
      node.remove();
      if (node.matches('.can-update')) {
        const btnApply = $('#apply-all-updates');
        btnApply.dataset.value = Number(btnApply.dataset.value) - 1;
      }
      filters.showStats();
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

  return {

    Events,

    handleBulkChange() {
      for (const msg of bulkChangeQueue) {
        const {id} = msg.style;
        if (msg.method === 'styleDeleted') {
          handleDelete(id);
          bulkChangeQueue.time = performance.now();
        } else {
          handleUpdateForId(id, msg);
        }
      }
      bulkChangeQueue.length = 0;
    },

    handleVisibilityChange() {
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
    },
  };
});
