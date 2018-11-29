/*
global messageBox getStyleWithNoCode
  filterAndAppend urlFilterParam showFiltersStats
  checkUpdate handleUpdateInstalled
  objectDiff
  configDialog
  sorter msg prefs API onDOMready $ $$ setupLivePrefs
  URLS enforceInputRange t formatDate
  getOwnTab getActiveTab openURL animateElement sessionStorageHash debounce
  scrollElementIntoView FIREFOX
  UI
*/
'use strict';

let installed;

const handleEvent = {};

Promise.all([
  API.getAllStyles(true),
  urlFilterParam && API.searchDB({query: 'url:' + urlFilterParam}),
  Promise.all([
    onDOMready(),
    prefs.initializing,
  ]).then(() => {
    initGlobalEvents();
    if (FIREFOX && 'update' in (chrome.commands || {})) {
      const btn = $('#manage-shortcuts-button');
      btn.classList.remove('chromium-only');
      btn.onclick = API.optionsCustomizeHotkeys;
    }
  }),
]).then(args => {
  UI.init();
  UI.showStyles(...args);
  lazyLoad();
});

msg.onExtension(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
      API.getStyle(msg.style.id, true).then(style => handleUpdate(style, msg));
      break;
    case 'styleDeleted':
      handleDelete(msg.style.id);
      break;
    case 'styleApply':
    case 'styleReplaceAll':
      break;
    default:
      return;
  }
  setTimeout(sorter.updateStripes, 0, {onlyWhenColumnsChanged: true});
}


function initGlobalEvents() {
  installed = $('#installed');
  installed.onclick = handleEvent.entryClicked;
  $('#manage-options-button').onclick = () => chrome.runtime.openOptionsPage();

  const btn = $('#manage-shortcuts-button');
  btn.onclick = btn.onclick || (() => openURL({url: URLS.configureCommands}));

  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));
  // show date installed & last update on hover
  installed.addEventListener('mouseover', handleEvent.lazyAddEntryTitle);
  installed.addEventListener('mouseout', handleEvent.lazyAddEntryTitle);

  document.addEventListener('visibilitychange', onVisibilityChange);

  document.addEventListener('keydown', event => {
    if (event.which === 27) {
      // close all open "applies-to" details
      $$('.applies-to-extra[open]').forEach(el => {
        el.removeAttribute('open');
      });
      // Close bulk actions
      $('#tools-wrapper').classList.add('hidden');
    } else if (event.which === 32 && event.target.classList.contains('checkmate')) {
      // pressing space toggles the containing checkbox
      $('input[type="checkbox"]', event.target).click();
    }
  });

  document.addEventListener('change', updateBulkFilters);

  $$('[data-toggle-on-click]').forEach(el => {
    // dataset on SVG doesn't work in Chrome 49-??, works in 57+
    const target = $(el.getAttribute('data-toggle-on-click'));
    el.onclick = event => {
      event.preventDefault();
      target.classList.toggle('hidden');
      if (target.classList.contains('hidden')) {
        el.removeAttribute('open');
      } else {
        el.setAttribute('open', '');
      }
    };
  });

  // triggered automatically by setupLivePrefs() below
  enforceInputRange($('#manage.newUI.targets'));

  // N.B. triggers existing onchange listeners
  setupLivePrefs();
  sorter.init();

  prefs.subscribe([
    'manage.newUI',
    'manage.newUI.favicons',
    'manage.newUI.faviconsGray',
    'manage.newUI.targets',
  ], () => switchUI());

  switchUI({styleOnly: true});
}


Object.assign(handleEvent, {

  ENTRY_ROUTES: {
    '.entry-state-toggle': 'toggle',
    '.entry-style-name': 'name',
    '.entry-homepage': 'external',
    '.entry-support': 'external',
    '.check-update': 'check',
    '.update': 'update',
    '.entry-delete': 'delete',
    '.entry-configure-usercss': 'config',
    '#toggle-actions': 'toggleBulkActions'
  },

  entryClicked(event) {
    const target = event.target;
    const entry = target.closest('.entry');
    for (const selector in handleEvent.ENTRY_ROUTES) {
      for (let el = target; el && el !== entry; el = el.parentElement) {
        if (el.matches(selector)) {
          const handler = handleEvent.ENTRY_ROUTES[selector];
          return handleEvent[handler].call(el, event, entry);
        }
      }
    }
  },

  name(event) {
    handleEvent.edit(event);
  },

  edit(event) {
    if (event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const left = event.button === 0;
    const middle = event.button === 1;
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const openWindow = left && shift && !ctrl;
    const openBackgroundTab = (middle && !shift) || (left && ctrl && !shift);
    const openForegroundTab = (middle && shift) || (left && ctrl && shift);
    const url = $('[href]', event.target.closest('.entry')).href;
    if (openWindow || openBackgroundTab || openForegroundTab) {
      if (chrome.windows && openWindow) {
        chrome.windows.create(Object.assign(prefs.get('windowPosition'), {url}));
      } else {
        getOwnTab().then(({index}) => {
          openURL({
            url,
            index: index + 1,
            active: openForegroundTab
          });
        });
      }
    } else {
      onVisibilityChange();
      getActiveTab().then(tab => {
        sessionStorageHash('manageStylesHistory').set(tab.id, url);
        location.href = url;
      });
    }
  },

  toggle(event, entry) {
    API.toggleStyle(entry.styleId, this.matches('.enable') || this.checked);
  },

  toggleBulkActions() {
    $('#tools-wrapper').classList.toggle('hidden');
  },

  check(event, entry) {
    event.preventDefault();
    checkUpdate(entry, {single: true});
  },

  update(event, entry) {
    event.preventDefault();
    const json = entry.updatedCode;
    json.id = entry.styleId;
    API[json.usercssData ? 'installUsercss' : 'installStyle'](json);
  },

  delete(event, entry) {
    event.preventDefault();
    const id = entry.styleId;
    animateElement(entry);
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: entry.styleMeta.name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button}) => {
      if (button === 0) {
        API.deleteStyle(id);
      }
    });
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
    event.preventDefault();
  },

  loadFavicons({all = false} = {}) {
    if (!installed.firstElementChild) return;
    let favicons = [];
    if (all) {
      favicons = $$('img[data-src]', installed);
    } else {
      const {left, top} = installed.firstElementChild.getBoundingClientRect();
      const x = Math.max(0, left);
      const y = Math.max(0, top);
      const first = document.elementFromPoint(x, y);
      const lastOffset = first.offsetTop + window.innerHeight;
      const numTargets = prefs.get('manage.newUI.targets');
      let entry = first && first.closest('.entry') || installed.children[0];
      while (entry && entry.offsetTop <= lastOffset) {
        favicons.push(...$$('img', entry).slice(0, numTargets).filter(img => img.dataset.src));
        entry = entry.nextElementSibling;
      }
    }
    let i = 0;
    for (const img of favicons) {
      img.src = img.dataset.src;
      delete img.dataset.src;
      // loading too many icons at once will block the page while the new layout is recalculated
      if (++i > 100) break;
    }
    if ($('img[data-src]', installed)) {
      debounce(handleEvent.loadFavicons, 1, {all: true});
    }
  },

  config(event, {styleMeta}) {
    event.preventDefault();
    configDialog(styleMeta);
  },

  lazyAddEntryTitle({type, target}) {
    const cell = target.closest('h2.style-name');
    if (cell) {
      const link = $('.style-name-link', cell);
      if (type === 'mouseover' && !link.title) {
        debounce(handleEvent.addEntryTitle, 50, link);
      } else {
        debounce.unregister(handleEvent.addEntryTitle);
      }
    }
  },

  addEntryTitle(link) {
    const entry = link.closest('.entry');
    link.title = [
      {prop: 'installDate', name: 'dateInstalled'},
      {prop: 'updateDate', name: 'dateUpdated'},
    ].map(({prop, name}) =>
      t(name) + ': ' + (formatDate(entry.styleMeta[prop]) || '—')).join('\n');
  }
});

function handleUpdate(style, {reason, method} = {}) {
  if (reason === 'editPreview' || reason === 'editPreviewEnd') return;
  let entry;
  let oldEntry = $(UI.ENTRY_ID_PREFIX + style.id);
  if (oldEntry && method === 'styleUpdated') {
    handleToggledOrCodeOnly();
  }
  entry = entry || UI.createStyleElement({style});
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
  if (!entry.matches('.hidden') && reason !== 'import') {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
  UI.getFaviconImgSrc(entry);

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
      $$('.checker', oldEntry).forEach(el => (el.checked = style.enabled));
      oldEntry.styleMeta = newStyleMeta;
      entry = oldEntry;
      oldEntry = null;
    }
  }
}


function handleDelete(id) {
  const node = $(UI.ENTRY_ID_PREFIX + id);
  if (node) {
    node.remove();
    if (node.matches('.can-update')) {
      const btnApply = $('#apply-all-updates');
      btnApply.dataset.value = Number(btnApply.dataset.value) - 1;
    }
    showFiltersStats();
  }
}


function switchUI({styleOnly} = {}) {
  const current = {};
  const changed = {};
  let someChanged = false;
  // ensure the global option is processed first
  for (const el of [$('#manage.newUI'), ...$$('[id^="manage.newUI."]')]) {
    const id = el.id.replace(/^manage\.newUI\.?/, '') || 'enabled';
    const value = el.type === 'checkbox' ? el.checked : Number(el.value);
    const valueChanged = value !== UI[id] && (id === 'enabled' || current.enabled);
    current[id] = value;
    changed[id] = valueChanged;
    someChanged |= valueChanged;
  }

  if (!styleOnly && !someChanged) {
    return;
  }

  Object.assign(UI, current);
  installed.classList.toggle('has-favicons', UI.favicons);
  installed.classList.toggle('faviconsGray', UI.faviconsGray);

  if (styleOnly) {
    return;
  }

  const missingFavicons = UI.favicons && !$('.entry-applies-to img');
  if (changed.enabled || (missingFavicons && !UI.createStyleElement.parts)) {
    installed.textContent = '';
    API.getAllStyles(true).then(UI.showStyles);
    return;
  }
  if (changed.targets) {
    for (const targets of $$('.entry .targets')) {
      const hasMore = targets.children.length > UI.targets;
      targets.parentElement.classList.toggle('has-more', hasMore);
    }
    return;
  }
  if (missingFavicons) {
    debounce(UI.getFaviconImgSrc);
    return;
  }
}


function onVisibilityChange() {
  switch (document.visibilityState) {
    // page restored without reloading via history navigation (currently only in FF)
    // the catch here is that DOM may be outdated so we'll at least refresh the just edited style
    // assuming other changes aren't important enough to justify making a complicated DOM sync
    case 'visible':
      if (sessionStorage.justEditedStyleId) {
        API.getStyle(Number(sessionStorage.justEditedStyleId), true)
          .then(style => {
            handleUpdate(style, {method: 'styleUpdated'});
          });
        delete sessionStorage.justEditedStyleId;
      }
      break;
    // going away
    case 'hidden':
      history.replaceState({scrollY: window.scrollY}, document.title);
      break;
  }
}

function updateBulkFilters({target}) {
  // total is undefined until initialized
  if (!installed.dataset.total) return;
  // ignore filter checkboxes
  if (target.type === 'checkbox' && !target.dataset.filter) {
    $('#tools-wrapper').classList.remove('hidden');
    const bulk = $('#toggle-all-filters');
    const state = target.checked;
    const visibleEntries = $$('.entry-filter-toggle')
      .filter(entry => !entry.closest('.entry').classList.contains('hidden'));
    bulk.indeterminate = false;
    if (target === bulk) {
      visibleEntries.forEach(entry => {
        entry.checked = state;
      });
    } else {
      if (visibleEntries.length === visibleEntries.filter(entry => entry.checked === state).length) {
        bulk.checked = state;
      } else {
        bulk.checked = false;
        bulk.indeterminate = true;
      }
    }
    const count = $$('.entry-filter-toggle').filter(entry => entry.checked).length;
    $('#bulk-filter-count').textContent = count || '';
  }
}

function lazyLoad() {
  setTimeout(() => {
    $$('link[data-href]').forEach(link => {
      link.href = link.dataset.href;
      link.removeAttribute('data-href');
    });
    $$('script[data-src]').forEach(script => {
      script.src = script.dataset.src;
      script.removeAttribute('data-src');
    });
  }, 500);
}
