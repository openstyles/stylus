/*
global messageBox getStyleWithNoCode retranslateCSS
global filtersSelector filterAndAppend urlFilterParam showFiltersStats
global checkUpdate handleUpdateInstalled
global objectDiff
global configDialog
global sorter
*/
'use strict';

let installed;

const ENTRY_ID_PREFIX_RAW = 'style-';
const ENTRY_ID_PREFIX = '#' + ENTRY_ID_PREFIX_RAW;

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
requestAnimationFrame(usePrefsDuringPageLoad);

const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps', 'exclusions'];
const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
const OWN_ICON = chrome.runtime.getManifest().icons['16'];

const handleEvent = {};

Promise.all([
  API.getStyles({omitCode: !BG}),
  urlFilterParam && API.searchDB({query: 'url:' + urlFilterParam}),
  onDOMready().then(initGlobalEvents),
]).then(args => {
  showStyles(...args);
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
  {
    const btn = $('#manage-shortcuts-button');
    btn.onclick = btn.onclick || (() => openURL({url: URLS.configureCommands}));
  }
  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));
  // show date installed & last update on hover
  installed.addEventListener('mouseover', handleEvent.lazyAddEntryTitle);
  installed.addEventListener('mouseout', handleEvent.lazyAddEntryTitle);

  // remember scroll position on normal history navigation
  window.onbeforeunload = rememberScrollPosition;

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

  $$('[id^="manage.newUI"]')
    .forEach(el => (el.oninput = (el.onchange = switchUI)));

  switchUI({styleOnly: true});

  // translate CSS manually
  document.head.appendChild($create('style', `
    .disabled h2::after {
      content: "${t('genericDisabledLabel')}";
    }
    #update-all-no-updates[data-skipped-edited="true"]:after {
      content: " ${t('updateAllCheckSucceededSomeEdited')}";
    }
    body.all-styles-hidden-by-filters:after {
      content: "${t('filteredStylesAllHidden')}";
    }
  `));
}


function showStyles(styles = [], matchUrlIds) {
  const sorted = sorter.sort({
    styles: styles.map(style => ({
      style,
      name: (style.name || '').toLocaleLowerCase() + '\n' + style.name,
    })),
  });
  let index = 0;
  let firstRun = true;
  installed.dataset.total = styles.length;
  const scrollY = (history.state || {}).scrollY;
  const shouldRenderAll = scrollY > window.innerHeight || sessionStorage.justEditedStyleId;
  const renderBin = document.createDocumentFragment();
  if (scrollY) {
    renderStyles();
  } else {
    requestAnimationFrame(renderStyles);
  }

  function renderStyles() {
    const t0 = performance.now();
    let rendered = 0;
    while (
      index < sorted.length &&
      // eslint-disable-next-line no-unmodified-loop-condition
      (shouldRenderAll || ++rendered < 20 || performance.now() - t0 < 10)
    ) {
      const info = sorted[index++];
      const entry = createStyleElement(info);
      if (matchUrlIds && !matchUrlIds.includes(info.style.id)) {
        entry.classList.add('not-matching');
        rendered--;
      }
      renderBin.appendChild(entry);
    }
    filterAndAppend({container: renderBin}).then(sorter.updateStripes);
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      if (firstRun) setTimeout(recreateStyleTargets, 0, {styles, iconsOnly: true});
      firstRun = false;
      return;
    }
    if (newUI.enabled && newUI.favicons) {
      setTimeout(recreateStyleTargets, 0, {iconsOnly: true});
    }
    if ('scrollY' in (history.state || {}) && !sessionStorage.justEditedStyleId) {
      setTimeout(window.scrollTo, 0, 0, history.state.scrollY);
    }
    if (sessionStorage.justEditedStyleId) {
      const entry = $(ENTRY_ID_PREFIX + sessionStorage.justEditedStyleId);
      delete sessionStorage.justEditedStyleId;
      if (entry) {
        animateElement(entry);
        requestAnimationFrame(() => scrollElementIntoView(entry));
      }
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
      editHrefBase: 'edit.html?id=',
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
      oldConfigure: !newUI.enabled && $('.configure-usercss', entry),
      oldCheckUpdate: !newUI.enabled && $('.check-update', entry),
      oldUpdate: !newUI.enabled && $('.update', entry),
    };
  }
  const parts = createStyleElement.parts;
  const configurable = style.usercssData && Object.keys(style.usercssData.vars).length > 0;
  parts.checker.checked = style.enabled;
  parts.nameLink.textContent = tWordBreak(style.name);
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';
  if (!newUI.enabled) {
    parts.oldConfigure.classList.toggle('hidden', !configurable);
    parts.oldCheckUpdate.classList.toggle('hidden', !style.updateUrl);
    parts.oldUpdate.classList.toggle('hidden', !style.updateUrl);
  }

  // clear the code to free up some memory
  // (note, style is already a deep copy)
  style.sourceCode = null;
  style.sections.forEach(section => (section.code = null));

  const entry = parts.entry.cloneNode(true);
  entry.id = ENTRY_ID_PREFIX_RAW + style.id;
  entry.styleId = style.id;
  entry.styleNameLowerCase = name || style.name.toLocaleLowerCase();
  entry.styleMeta = style;
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '') +
    (style.usercssData ? ' usercss' : '');

  if (style.url) {
    $('.homepage', entry).appendChild(parts.homepageIcon.cloneNode(true));
  }
  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(template.updaterIcons.cloneNode(true));
  }
  if (configurable && newUI.enabled) {
    $('.actions', entry).appendChild(template.configureIcon.cloneNode(true));
  }

  createStyleTargetsElement({entry, style});

  return entry;
}


function createStyleTargetsElement({entry, style, iconsOnly}) {
  const parts = createStyleElement.parts;
  const entryTargets = $('.targets', entry);
  const targets = iconsOnly ? entryTargets : parts.targets.cloneNode(true);
  let container = targets;
  let numTargets = 0;
  const displayed = new Set();
  for (const type of TARGET_TYPES) {
    const isExcluded = type === 'exclusions';
    const sections = isExcluded ? [''] : style.sections;
    if (isExcluded && !newUI.enabled && Object.keys(style.exclusions || {}).length > 0) {
      $('.applies-to', entry).insertAdjacentElement('afterend', template.excludedOn.cloneNode(true));
      container = $('.excluded-on .targets', entry);
      numTargets = 1;
    }
    for (const section of sections) {
      const target = isExcluded ? Object.keys(style.exclusions || {}) : section[type] || [];
      for (const targetValue of target) {
        if (displayed.has(targetValue)) {
          continue;
        }
        displayed.add(targetValue);
        const element = iconsOnly ? targets.children[numTargets] : template.appliesToTarget.cloneNode(true);
        if (!newUI.enabled) {
          if (numTargets === 10) {
            container = container.appendChild(template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(template.appliesToSeparator.cloneNode(true));
          }
        }
        if (!iconsOnly) {
          element.dataset.type = type;
          element.appendChild(
            document.createTextNode(
              (parts.decorations[type + 'Before'] || '') +
              targetValue +
              (parts.decorations[type + 'After'] || '')));
          container.appendChild(element);
        }
        numTargets++;
      }
    }
  }
  if (newUI.enabled) {
    if (numTargets > newUI.targets) {
      $('.applies-to', entry).classList.add('has-more');
    }
  }
  if (numTargets) {
    if (!iconsOnly) {
      entryTargets.parentElement.replaceChild(targets, entryTargets);
    }
  } else if (!entry.classList.contains('global') ||
             !entryTargets.firstElementChild) {
    if (entryTargets.firstElementChild) {
      entryTargets.textContent = '';
    }
    entryTargets.appendChild(template.appliesToEverything.cloneNode(true));
  }
  entry.classList.toggle('global', !numTargets);
}


function recreateStyleTargets({styles, iconsOnly = false} = {}) {
  Promise.resolve(styles || API.getStyles()).then(styles => {
    for (const style of styles) {
      const entry = $(ENTRY_ID_PREFIX + style.id);
      if (entry) {
        createStyleTargetsElement({
          entry,
          style,
          iconsOnly,
        });
      }
    }
    if (newUI.enabled && newUI.favicons) {
      debounce(getFaviconImgSrc);
    }
  });
}

function getFaviconImgSrc(container = installed) {
  const targets = $$('.target', container);
  const regexpRemoveNegativeLookAhead = /(\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)/g;
  // replace extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz
  const regexpReplaceExtraCharacters = /[\\(]|((\|\w+)+\))/g;
  const domainExt = 'com,org,co,net,im,io,edu,gov,biz,info,de,cn,uk,nl,eu,ru'.split(',');
  const regexpMatchRegExp = new RegExp(`[\\w-]+[\\.(]+(${domainExt.join('|')})\\b`, 'g');
  const regexpMatchDomain = /^.*?:\/\/([^/]+)/;
  for (const target of targets) {
    const type = target.dataset.type;
    const targetValue = target.textContent;
    let favicon = '';
    if (type === 'domains') {
      favicon = GET_FAVICON_URL + targetValue;
    } else if (targetValue.includes('chrome-extension:') || targetValue.includes('moz-extension:')) {
      favicon = OWN_ICON;
    } else if (type === 'regexps' || type === 'exclusions') {
      favicon = targetValue
        .replace(regexpRemoveNegativeLookAhead, '')
        .replace(regexpReplaceExtraCharacters, '')
        .match(regexpMatchRegExp);
      favicon = favicon ? GET_FAVICON_URL + favicon.shift() : '';
    } else {
      favicon = targetValue.includes('://') && targetValue.match(regexpMatchDomain);
      favicon = favicon ? GET_FAVICON_URL + favicon[1] : '';
    }
    if (favicon) {
      const img = target.children[0];
      if (!img || img.localName !== 'img') {
        target.insertAdjacentElement('afterbegin', document.createElement('img'))
          .dataset.src = favicon;
      } else if ((img.dataset.src || img.src) !== favicon) {
        img.src = '';
        img.dataset.src = favicon;
      }
    }
  }
  handleEvent.loadFavicons();
}


Object.assign(handleEvent, {

  ENTRY_ROUTES: {
    '.checker, .enable, .disable': 'toggle',
    '.style-name': 'name',
    '.homepage': 'external',
    '.check-update': 'check',
    '.update': 'update',
    '.delete': 'delete',
    '.applies-to .expander': 'expandTargets',
    '.configure-usercss': 'config'
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
    if (newUI.enabled) handleEvent.edit(event);
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
      rememberScrollPosition();
      getActiveTab().then(tab => {
        sessionStorageHash('manageStylesHistory').set(tab.id, url);
        location.href = url;
      });
    }
  },

  toggle(event, entry) {
    API.saveStyle({
      id: entry.styleId,
      enabled: this.matches('.enable') || this.checked,
    });
  },

  check(event, entry) {
    event.preventDefault();
    checkUpdate(entry, {single: true});
  },

  update(event, entry) {
    event.preventDefault();
    const json = entry.updatedCode;
    json.id = entry.styleId;
    json.reason = 'update';
    API[json.usercssData ? 'saveUsercss' : 'saveStyle'](json);
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
        API.deleteStyle({id});
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

  expandTargets(event) {
    event.preventDefault();
    this.closest('.applies-to').classList.toggle('expanded');
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
  if (reason === 'editPreview') return;
  // the style was toggled and refreshAllTabs() sent a mini-notification,
  // but we've already processed 'styleUpdated' sent directly from notifyAllTabs()
  if (!style.sections) return;
  let entry;
  let oldEntry = $(ENTRY_ID_PREFIX + style.id);
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
  if (!entry.matches('.hidden') && reason !== 'import') {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
  if (newUI.enabled && newUI.favicons) {
    getFaviconImgSrc(entry);
  }

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
  const node = $(ENTRY_ID_PREFIX + id);
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
    const valueChanged = value !== newUI[id] && (id === 'enabled' || current.enabled);
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
    .newUI .target[data-type="exclusions"]:before {
      content: '${t('exclusionsPrefix')}';
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
  `) + (CHROME >= 3004 ? `
    .newUI .entry {
      contain: strict;
    }
    .newUI .entry > * {
      contain: content;
    }
    .newUI .entry .actions {
      contain: none;
    }
    .newUI .target {
      contain: layout style;
    }
    .newUI .target img {
      contain: layout style size;
    }
    .newUI .entry.can-update,
    .newUI .entry.update-problem,
    .newUI .entry.update-done {
      contain: none;
    }
  ` : '');

  if (styleOnly) {
    return;
  }

  const missingFavicons = newUI.enabled && newUI.favicons && !$('.applies-to img');
  if (changed.enabled || (missingFavicons && !createStyleElement.parts)) {
    installed.textContent = '';
    API.getStyles().then(showStyles);
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
    recreateStyleTargets();
    return;
  }
}


function rememberScrollPosition() {
  history.replaceState({scrollY: window.scrollY}, document.title);
}


function usePrefsDuringPageLoad() {
  for (const id of Object.getOwnPropertyNames(prefs.readOnlyValues)) {
    const value = prefs.readOnlyValues[id];
    if (value !== true) continue;
    const el = document.getElementById(id) ||
      id.includes('expanded') && $(`details[data-pref="${id}"]`);
    if (!el) continue;
    if (el.type === 'checkbox') {
      el.checked = value;
    } else if (el.localName === 'details') {
      el.open = value;
    } else {
      el.value = value;
    }
  }
  if (!VIVALDI) {
    $$('#header select').forEach(el => el.adjustWidth());
  }

  if (FIREFOX && 'update' in (chrome.commands || {})) {
    const btn = $('#manage-shortcuts-button');
    btn.classList.remove('chromium-only');
    btn.onclick = API.optionsCustomizeHotkeys;
  }
}
