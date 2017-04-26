/* global messageBox, getStyleWithNoCode */
'use strict';

let installed;
const filtersSelector = {
  hide: '',
  unhide: '',
};

const newUI = {
  enabled: prefs.get('manage.newUI'),
  favicons: prefs.get('manage.newUI.favicons'),
  faviconsGray: prefs.get('manage.newUI.faviconsGray'),
  targets: prefs.get('manage.newUI.targets'),
  renderClass() {
    document.documentElement.classList.toggle('newUI', newUI.enabled);
  },
};
newUI.renderClass();

const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps'];
const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
const OWN_ICON = chrome.runtime.getManifest().icons['16'];

const handleEvent = {};

Promise.all([
  getStylesSafe(),
  onDOMready().then(initGlobalEvents),
]).then(([styles]) => {
  showStyles(styles);
});


chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
      handleUpdate(msg.style, msg);
      break;
    case 'styleDeleted':
      handleDelete(msg.id);
      break;
  }
}


function initGlobalEvents() {
  installed = $('#installed');
  installed.onclick = handleEvent.entryClicked;
  $('#check-all-updates').onclick = checkUpdateAll;
  $('#check-all-updates-force').onclick = checkUpdateAll;
  $('#apply-all-updates').onclick = applyUpdateAll;
  $('#update-history').onclick = showUpdateHistory;
  $('#search').oninput = searchStyles;
  $('#manage-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#manage-shortcuts-button').onclick = () => openURL({url: URLS.configureCommands});
  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));

  // focus search field on / key
  document.onkeypress = event => {
    if ((event.keyCode || event.which) == 47
    && !event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
    && !event.target.matches('[type="text"], [type="search"]')) {
      event.preventDefault();
      $('#search').focus();
    }
  };

  // remember scroll position on normal history navigation
  window.onbeforeunload = rememberScrollPosition;

  $$('[data-toggle-on-click]').forEach(el => {
    // dataset on SVG doesn't work in Chrome 49-??, works in 57+
    const target = $(el.getAttribute('data-toggle-on-click'));
    el.onclick = () => target.classList.toggle('hidden');
  });

  // triggered automatically by setupLivePrefs() below
  enforceInputRange($('#manage.newUI.targets'));

  // N.B. triggers existing onchange listeners
  setupLivePrefs();

  $$('[data-filter]').forEach(el => {
    el.onchange = handleEvent.filterOnChange;
    if (el.closest('.hidden')) {
      el.checked = false;
    }
  });
  handleEvent.filterOnChange({forceRefilter: true});

  $$('[id^="manage.newUI"]')
    .forEach(el => (el.oninput = (el.onchange = switchUI)));

  switchUI({styleOnly: true});
}


function showStyles(styles = []) {
  const sorted = styles
    .map(style => ({name: style.name.toLocaleLowerCase(), style}))
    .sort((a, b) => (a.name < b.name ? -1 : a.name == b.name ? 0 : 1));
  let index = 0;
  const shouldRenderAll = (history.state || {}).scrollY > window.innerHeight;
  const renderBin = document.createDocumentFragment();
  if (shouldRenderAll) {
    renderStyles();
  } else {
    requestAnimationFrame(renderStyles);
  }

  function renderStyles() {
    const t0 = performance.now();
    let rendered = 0;
    while (index < sorted.length
    && (shouldRenderAll || ++rendered < 10 || performance.now() - t0 < 10)) {
      renderBin.appendChild(createStyleElement(sorted[index++]));
    }
    filterAndAppend({container: renderBin});
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      return;
    }
    if ('scrollY' in (history.state || {})) {
      setTimeout(window.scrollTo, 0, 0, history.state.scrollY);
    }
    if (newUI.enabled && newUI.favicons) {
      debounce(handleEvent.loadFavicons, 16);
    }
  }
}


function createStyleElement({style, name}) {
  // query the sub-elements just once, then reuse the references
  if ((createStyleElement.parts || {}).newUI !== newUI.enabled) {
    const entry = template[`style${newUI.enabled ? 'Compact' : ''}`];
    createStyleElement.parts = {
      newUI: newUI.enabled,
      entry,
      entryClassBase: entry.className,
      checker: $('.checker', entry) || {},
      nameLink: $('.style-name-link', entry),
      editLink: $('.style-edit-link', entry) || {},
      editHrefBase: $('.style-name-link', entry).getAttribute('href'),
      homepage: $('.homepage', entry),
      homepageIcon: template[`homepageIcon${newUI.enabled ? 'Small' : 'Big'}`],
      appliesTo: $('.applies-to', entry),
      targets: $('.targets', entry),
      expander: $('.expander', entry),
      decorations: {
        urlPrefixesAfter: '*',
        regexpsBefore: '/',
        regexpsAfter: '/',
      },
    };
  }
  const parts = createStyleElement.parts;
  parts.checker.checked = style.enabled;
  parts.nameLink.textContent = style.name;
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';

  const entry = parts.entry.cloneNode(true);
  entry.id = 'style-' + style.id;
  entry.styleId = style.id;
  entry.styleNameLowerCase = name || style.name.toLocaleLowerCase();
  entry.styleMeta = getStyleWithNoCode(style);
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '');

  if (style.url) {
    $('.homepage', entry).appendChild(parts.homepageIcon.cloneNode(true));
  }
  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(template.updaterIcons.cloneNode(true));
  }

  // name being supplied signifies we're invoked by showStyles()
  // which debounces its main loop thus loading the postponed favicons
  createStyleTargetsElement({entry, style, postponeFavicons: name});

  return entry;
}


function createStyleTargetsElement({entry, style, postponeFavicons}) {
  const parts = createStyleElement.parts;
  const targets = parts.targets.cloneNode(true);
  let container = targets;
  let numTargets = 0;
  let numIcons = 0;
  const displayed = new Set();
  for (const type of TARGET_TYPES) {
    for (const section of style.sections) {
      for (const targetValue of section[type] || []) {
        if (displayed.has(targetValue)) {
          continue;
        }
        displayed.add(targetValue);
        const element = template.appliesToTarget.cloneNode(true);
        if (!newUI.enabled) {
          if (numTargets == 10) {
            container = container.appendChild(template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(template.appliesToSeparator.cloneNode(true));
          }
        } else if (newUI.favicons) {
          let favicon = '';
          if (type == 'domains') {
            favicon = GET_FAVICON_URL + targetValue;
          } else if (targetValue.startsWith('chrome-extension:')) {
            favicon = OWN_ICON;
          } else if (type != 'regexps') {
            favicon = targetValue.includes('://') && targetValue.match(/^.*?:\/\/([^/]+)/);
            favicon = favicon ? GET_FAVICON_URL + favicon[1] : '';
          }
          if (favicon) {
            element.appendChild(document.createElement('img')).dataset.src = favicon;
            numIcons++;
          }
        }
        element.appendChild(
          document.createTextNode(
            (parts.decorations[type + 'Before'] || '') +
            targetValue +
            (parts.decorations[type + 'After'] || '')));
        container.appendChild(element);
        numTargets++;
      }
    }
  }
  if (newUI.enabled) {
    if (numTargets > newUI.targets) {
      $('.applies-to', entry).classList.add('has-more');
    }
    if (numIcons && !postponeFavicons) {
      debounce(handleEvent.loadFavicons);
    }
  }
  const entryTargets = $('.targets', entry);
  if (numTargets) {
    entryTargets.parentElement.replaceChild(targets, entryTargets);
  } else {
    entryTargets.appendChild(template.appliesToEverything.cloneNode(true));
  }
  entry.classList.toggle('global', !numTargets);
}


Object.assign(handleEvent, {

  ENTRY_ROUTES: {
    '.checker, .enable, .disable': 'toggle',
    '.style-name-link': 'edit',
    '.homepage': 'external',
    '.check-update': 'check',
    '.update': 'update',
    '.delete': 'delete',
    '.applies-to .expander': 'expandTargets',
  },

  entryClicked(event) {
    const target = event.target;
    const entry = target.closest('.entry');
    for (const selector in handleEvent.ENTRY_ROUTES) {
      for (let el = target; el && el != entry; el = el.parentElement) {
        if (el.matches(selector)) {
          const handler = handleEvent.ENTRY_ROUTES[selector];
          return handleEvent[handler].call(el, event, entry);
        }
      }
    }
  },

  edit(event) {
    if (event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const left = event.button == 0;
    const middle = event.button == 1;
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const openWindow = left && shift && !ctrl;
    const openBackgroundTab = (middle && !shift) || (left && ctrl && !shift);
    const openForegroundTab = (middle && shift) || (left && ctrl && shift);
    const url = event.target.closest('[href]').href;
    if (openWindow || openBackgroundTab || openForegroundTab) {
      if (openWindow) {
        chrome.windows.create(Object.assign(prefs.get('windowPosition'), {url}));
      } else {
        openURL({url, active: openForegroundTab});
      }
    } else {
      rememberScrollPosition();
      getActiveTab().then(tab => {
        sessionStorageHash('manageStylesHistory').set(tab.id, url);
        location.href = url;
      });
    }
  },

  toggle(event, entry) {
    saveStyleSafe({
      id: entry.styleId,
      enabled: this.matches('.enable') || this.checked,
    });
  },

  check(event, entry) {
    checkUpdate(entry);
  },

  update(event, entry) {
    // update everything but name
    saveStyleSafe(Object.assign(entry.updatedCode, {
      id: entry.styleId,
      name: null,
      reason: 'update',
    }));
  },

  delete(event, entry) {
    const id = entry.styleId;
    const {name} = BG.cachedStyles.byId.get(id) || {};
    animateElement(entry, {className: 'highlight'});
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button, enter, esc}) => {
      if (button == 0 || enter) {
        deleteStyleSafe({id});
      }
    });
  },

  external(event) {
    openURL({url: event.target.closest('a').href});
    event.preventDefault();
  },

  expandTargets() {
    this.closest('.applies-to').classList.toggle('expanded');
  },

  loadFavicons(container = document.body) {
    for (const img of container.getElementsByTagName('img')) {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
    }
  },

  filterOnChange({target: el, forceRefilter}) {
    const getValue = el => (el.type == 'checkbox' ? el.checked : el.value.trim());
    if (!forceRefilter) {
      const value = getValue(el);
      if (value == el.lastValue) {
        return;
      }
      el.lastValue = value;
    }
    const enabledFilters = $$('#header [data-filter]').filter(el => getValue(el));
    const buildFilter = hide =>
      (hide ? '' : '.entry.hidden') +
      [...enabledFilters.map(el =>
        el.dataset[hide ? 'filterHide' : 'filter']
          .split(/,\s*/)
          .map(s => (hide ? '.entry:not(.hidden)' : '') + s)
          .join(','))
      ].join(hide ? ',' : '');
    Object.assign(filtersSelector, {
      hide: buildFilter(true),
      unhide: buildFilter(false),
    });
    reapplyFilter();
  },
});


function handleUpdate(style, {reason, method} = {}) {
  let entry;
  let oldEntry = $('#style-' + style.id);
  if (oldEntry && method == 'styleUpdated') {
    handleToggledOrCodeOnly();
  }
  entry = entry || createStyleElement({style});
  if (oldEntry) {
    if (oldEntry.styleNameLowerCase == entry.styleNameLowerCase) {
      installed.replaceChild(entry, oldEntry);
    } else {
      oldEntry.remove();
    }
  }
  if (reason == 'update' && entry.matches('.updatable')) {
    handleUpdateInstalled();
  }
  filterAndAppend({entry});
  if (!entry.matches('.hidden') && reason != 'import') {
    animateElement(entry, {className: 'highlight'});
    scrollElementIntoView(entry);
  }

  function handleToggledOrCodeOnly() {
    const newStyleMeta = getStyleWithNoCode(style);
    const diff = objectDiff(oldEntry.styleMeta, newStyleMeta);
    if (diff.length == 0) {
      // only code was modified
      entry = oldEntry;
      oldEntry = null;
    }
    if (diff.length == 1 && diff[0].key == 'enabled') {
      oldEntry.classList.toggle('enabled', style.enabled);
      oldEntry.classList.toggle('disabled', !style.enabled);
      $$('.checker', oldEntry).forEach(el => (el.checked = style.enabled));
      oldEntry.styleMeta = newStyleMeta;
      entry = oldEntry;
      oldEntry = null;
    }
  }

  function handleUpdateInstalled() {
    entry.classList.add('update-done');
    entry.classList.remove('can-update', 'updatable');
    $('.update-note', entry).textContent = t('updateCompleted');
    renderUpdatesOnlyFilter();
  }
}


function handleDelete(id) {
  const node = $('#style-' + id);
  if (node) {
    node.remove();
    if (node.matches('.can-update')) {
      const btnApply = $('#apply-all-updates');
      btnApply.dataset.value = Number(btnApply.dataset.value) - 1;
    }
  }
}


function switchUI({styleOnly} = {}) {
  const current = {};
  const changed = {};
  let someChanged = false;
  // ensure the global option is processed first
  for (const el of [$('#manage.newUI'), ...$$('[id^="manage.newUI."]')]) {
    const id = el.id.replace(/^manage\.newUI\.?/, '') || 'enabled';
    const value = el.type == 'checkbox' ? el.checked : Number(el.value);
    const valueChanged = value !== newUI[id] && (id == 'enabled' || current.enabled);
    current[id] = value;
    changed[id] = valueChanged;
    someChanged |= valueChanged;
  }

  if (!styleOnly && !someChanged) {
    return;
  }

  Object.assign(newUI, current);
  newUI.renderClass();
  installed.classList.toggle('has-favicons', newUI.favicons);
  $('#style-overrides').textContent = `
    .newUI .targets {
      max-height: ${newUI.targets * 18}px;
    }
    ` + (newUI.faviconsGray ? `
    .newUI .target img {
      -webkit-filter: grayscale(1);
      filter: grayscale(1);
      opacity: .25;
    }
    ` : `
    .newUI .target img {
      -webkit-filter: none;
      filter: none;
      opacity: 1;
    }
  `);

  if (styleOnly) {
    return;
  }

  const missingFavicons = newUI.enabled && newUI.favicons && !$('.applies-to img');
  if (changed.enabled || (missingFavicons && !createStyleElement.parts)) {
    installed.innerHTML = '';
    getStylesSafe().then(showStyles);
    return;
  }
  if (changed.targets) {
    for (const targets of $$('.entry .targets')) {
      const hasMore = targets.children.length > newUI.targets;
      targets.parentElement.classList.toggle('has-more', hasMore);
    }
    return;
  }
  if (missingFavicons) {
    getStylesSafe().then(styles => {
      for (const style of styles) {
        const entry = $('#style-' + style.id);
        if (entry) {
          createStyleTargetsElement({entry, style, postponeFavicons: true});
        }
      }
      debounce(handleEvent.loadFavicons);
    });
    return;
  }
}


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

  const ignoreDigest = this && this.id == 'check-all-updates-force';
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
        if (++updated == 1) {
          $('#apply-all-updates').disabled = true;
          $('#apply-all-updates').classList.remove('hidden');
        }
        $('#apply-all-updates').dataset.value = updated;
        // fallthrough
      case BG.updater.SKIPPED:
        checked++;
        if (details == BG.updater.EDITED || details == BG.updater.MAYBE_EDITED) {
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
    $('#check-all-updates').disabled = total == 0;
    $('#apply-all-updates').disabled = false;
    renderUpdatesOnlyFilter({check: updated + skippedEdited > 0});
    if (!updated) {
      $('#update-all-no-updates').dataset.skippedEdited = skippedEdited > 0;
      $('#update-all-no-updates').classList.remove('hidden');
      $('#check-all-updates-force').classList.toggle('hidden', skippedEdited == 0);
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
  const entry = $('#style-' + style.id);
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
      const same = details == BG.updater.SAME_MD5 || details == BG.updater.SAME_CODE;
      const edited = details == BG.updater.EDITED || details == BG.updater.MAYBE_EDITED;
      entry.dataset.details = details;
      if (!details) {
        details = t('updateCheckFailServerUnreachable');
      } else if (typeof details == 'number') {
        details = t('updateCheckFailBadResponseCode', [details]);
      } else if (details == BG.updater.EDITED) {
        details = t('updateCheckSkippedLocallyEdited') + '\n' + t('updateCheckManualUpdateHint');
      } else if (details == BG.updater.MAYBE_EDITED) {
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


function searchStyles({immediately, container}) {
  const searchElement = $('#search');
  const query = searchElement.value.toLocaleLowerCase();
  const queryPrev = searchElement.lastValue || '';
  if (query == queryPrev && !immediately && !container) {
    return;
  }
  if (!immediately) {
    clearTimeout(searchStyles.timeout);
    searchStyles.timeout = setTimeout(searchStyles, 150, {immediately: true});
    return;
  }
  searchElement.lastValue = query;

  const searchInVisible = queryPrev && query.includes(queryPrev);
  const entries = container && container.children || container ||
    (searchInVisible ? $$('.entry:not(.hidden)') : installed.children);
  let needsRefilter = false;
  for (const entry of entries) {
    let isMatching = !query;
    if (!isMatching) {
      const style = BG.cachedStyles.byId.get(entry.styleId) || {};
      isMatching = Boolean(style && (
        isMatchingText(style.name) ||
        style.url && isMatchingText(style.url) ||
        isMatchingStyle(style)));
    }
    if (entry.classList.contains('not-matching') != !isMatching) {
      entry.classList.toggle('not-matching', !isMatching);
      needsRefilter = true;
    }
  }
  if (needsRefilter && !container) {
    handleEvent.filterOnChange({forceRefilter: true});
  }
  return;

  function isMatchingStyle(style) {
    for (const section of style.sections) {
      for (const prop in section) {
        const value = section[prop];
        switch (typeof value) {
          case 'string':
            if (isMatchingText(value)) {
              return true;
            }
            break;
          case 'object':
            for (const str of value) {
              if (isMatchingText(str)) {
                return true;
              }
            }
            break;
        }
      }
    }
  }

  function isMatchingText(text) {
    return text.toLocaleLowerCase().indexOf(query) >= 0;
  }
}


function filterAndAppend({entry, container}) {
  if (!container) {
    container = [entry];
    // reverse the visibility, otherwise reapplyFilter will see no need to work
    if (!filtersSelector.hide || !entry.matches(filtersSelector.hide)) {
      entry.classList.add('hidden');
    }
  }
  if ($('#search').value.trim()) {
    searchStyles({immediately: true, container});
  }
  reapplyFilter(container);
}


function reapplyFilter(container = installed) {
  // A: show
  let toUnhide = filtersSelector.hide ? filterContainer({hide: false}) : container;
  // showStyles() is building the page and no filters are active
  if (toUnhide instanceof DocumentFragment) {
    installed.appendChild(toUnhide);
    return;
  } else if (toUnhide.length && $('#search').value.trim()) {
    searchStyles({immediately: true, container: toUnhide});
    toUnhide = filterContainer({hide: false});
  }
  // filtering needed or a single-element job from handleUpdate()
  const entries = installed.children;
  const numEntries = entries.length;
  let numVisible = numEntries - $$('.entry.hidden').length;
  for (const entry of toUnhide.children || toUnhide) {
    const next = findInsertionPoint(entry);
    if (entry.nextElementSibling !== next) {
      installed.insertBefore(entry, next);
    }
    if (entry.classList.contains('hidden')) {
      entry.classList.remove('hidden');
      numVisible++;
    }
  }
  // B: hide
  const toHide = filtersSelector.hide ? filterContainer({hide: true}) : [];
  if (!toHide.length) {
    return;
  }
  for (const entry of toHide) {
    entry.classList.add('hidden');
  }
  // showStyles() is building the page with filters active so we need to:
  // 1. add all hidden entries to the end
  // 2. add the visible entries before the first hidden entry
  if (container instanceof DocumentFragment) {
    for (const entry of toHide) {
      installed.appendChild(entry);
    }
    installed.insertBefore(container, $('.entry.hidden'));
    return;
  }
  // normal filtering of the page or a single-element job from handleUpdate()
  // we need to keep the visible entries together at the start
  // first pass only moves one hidden entry in hidden groups with odd number of items
  shuffle(false);
  setTimeout(shuffle, 0, true);
  // single-element job from handleEvent(): add the last wraith
  if (toHide.length == 1 && toHide[0].parentElement != installed) {
    installed.appendChild(toHide[0]);
  }
  return;

  function filterContainer({hide}) {
    const selector = filtersSelector[hide ? 'hide' : 'unhide'];
    if (container.filter) {
      if (hide) {
        // already filtered in previous invocation
        return container;
      }
      const toHide = [], toUnhide = [];
      for (const el of container) {
        (el.matches(selector) ? toUnhide : toHide).push(el);
      }
      container = toHide;
      return toUnhide;
    } else {
      return $$(selector, container);
    }
  }

  function shuffle(fullPass) {
    if (fullPass && !document.body.classList.contains('update-in-progress')) {
      $('#check-all-updates').disabled = !$('.updatable:not(.can-update)');
    }
    // 1. skip the visible group on top
    let firstHidden = $('#installed > .hidden');
    let entry = firstHidden;
    let i = [...entries].indexOf(entry);
    let horizon = entries[numVisible];
    const skipGroup = state => {
      const start = i;
      const first = entry;
      while (entry && entry.classList.contains('hidden') == state) {
        entry = entry.nextElementSibling;
        i++;
      }
      return {first, start, len: i - start};
    };
    let prevGroup = i ? {first: entries[0], start: 0, len: i} : skipGroup(true);
    // eslint-disable-next-line no-unmodified-loop-condition
    while (entry) {
      // 2a. find the next hidden group's start and end
      // 2b. find the next visible group's start and end
      const isHidden = entry.classList.contains('hidden');
      const group = skipGroup(isHidden);
      const hidden = isHidden ? group : prevGroup;
      const visible = isHidden ? prevGroup : group;
      // 3. move the shortest group; repeat 2-3
      if (hidden.len < visible.len && (fullPass || hidden.len % 2)) {
        // 3a. move hidden under the horizon
        for (let j =  0; j < (fullPass ? hidden.len : 1); j++) {
          const entry = entries[hidden.start];
          installed.insertBefore(entry, horizon);
          horizon = entry;
          i--;
        }
        prevGroup = isHidden ? skipGroup(false) : group;
        firstHidden = entry;
      } else if (isHidden || !fullPass) {
        prevGroup = group;
      } else {
        // 3b. move visible above the horizon
        for (let j = 0; j < visible.len; j++) {
          const entry = entries[visible.start + j];
          installed.insertBefore(entry, firstHidden);
        }
        prevGroup = {
          first: firstHidden,
          start: hidden.start + visible.len,
          len: hidden.len + skipGroup(true).len,
        };
      }
    }
  }

  function findInsertionPoint(entry) {
    const nameLLC = entry.styleNameLowerCase;
    let a = 0;
    let b = Math.min(numEntries, numVisible) - 1;
    if (b < 0) {
      return entries[numVisible];
    }
    if (entries[0].styleNameLowerCase > nameLLC) {
      return entries[0];
    }
    if (entries[b].styleNameLowerCase <= nameLLC) {
      return entries[numVisible];
    }
    // bisect
    while (a < b - 1) {
      const c = (a + b) / 2 | 0;
      if (nameLLC < entries[c].styleNameLowerCase) {
        b = c;
      } else {
        a = c;
      }
    }
    if (entries[a].styleNameLowerCase > nameLLC) {
      return entries[a];
    }
    while (a <= b && entries[a].styleNameLowerCase < nameLLC) {
      a++;
    }
    return entries[entries[a].styleNameLowerCase <= nameLLC ? a + 1 : a];
  }
}


function rememberScrollPosition() {
  history.replaceState({scrollY: window.scrollY}, document.title);
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
    if (a && typeof a.filter == 'function' && b && typeof b.filter == 'function') {
      if (a.length != b.length
      || a.some((el, i) => !el || typeof el != 'object' ? el != b[i]
          : objectDiff(el, b[i], path + key + '[' + i + '].').length)
      ) {
        diff.push({path, key, values: [a, b], type: 'changed'});
      }
    } else if (typeof a == 'object' && typeof b == 'object') {
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
