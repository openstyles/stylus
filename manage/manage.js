/* global
  $
  $$
  $create
  animateElement
  API
  checkUpdate
  CHROME
  configDialog
  debounce
  filterAndAppend
  getOwnTab
  getStyleWithNoCode
  handleUpdateInstalled
  messageBox
  msg
  objectDiff
  openURL
  prefs
  router
  scrollElementIntoView
  sessionStore
  setupLivePrefs
  showFiltersStats
  sorter
  t
  VIVALDI
*/
'use strict';

/** @type {HTMLElement} */
let installed;

const ENTRY_ID_PREFIX_RAW = 'style-';
const ENTRY_ID_PREFIX = '#' + ENTRY_ID_PREFIX_RAW;
const REVEAL_DATES_FOR = 'h2.style-name, [data-type=age]';

const BULK_THROTTLE_MS = 100;
const bulkChangeQueue = [];
bulkChangeQueue.time = 0;

// define pref-mapped ids separately
const newUI = {
  enabled: null, // the global option should come first
  favicons: null,
  faviconsGray: null,
  sliders: null,
  targets: null,
};
// ...add utility functions
Object.assign(newUI, {
  ids: Object.keys(newUI),
  prefKeyForId: id =>
    id === 'sliders' ? `ui.${id}` :
      id === 'enabled' ? 'manage.newUI' :
        `manage.newUI.${id}`,
  renderClass: () => document.documentElement.classList.toggle('newUI', newUI.enabled),
  tpl: {
    getToggle() {
      return t.template[newUI.sliders ? 'toggleSlider' : 'toggleChecker'].cloneNode(true);
    },
    getEntry() {
      const tpl = t.template[newUI.enabled ? 'styleNewUI' : 'style'].cloneNode(true);
      if (newUI.enabled) {
        const slot = $('toggle', tpl);
        slot.parentElement.replaceChild(newUI.tpl.getToggle(), slot);
      }
      return tpl;
    },
  },
});
// ...read the actual values
for (const id of newUI.ids) {
  newUI[id] = prefs.get(newUI.prefKeyForId(id));
}
newUI.renderClass();

const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps'];
const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
const OWN_ICON = chrome.runtime.getManifest().icons['16'];
const AGES = [
  [24, 'h', t('dateAbbrHour', '\x01')],
  [30, 'd', t('dateAbbrDay', '\x01')],
  [12, 'm', t('dateAbbrMonth', '\x01')],
  [Infinity, 'y', t('dateAbbrYear', '\x01')],
];

const handleEvent = {};

(async () => {
  const query = router.getSearch('search');
  const [styles, ids, el] = await Promise.all([
    API.getAllStyles(),
    query && API.searchDB({query, mode: router.getSearch('searchMode')}),
    waitForSelector('#installed'), // needed to avoid flicker due to an extra frame and layout shift
    prefs.initializing,
  ]);
  installed = el;
  installed.onclick = handleEvent.entryClicked;
  $('#manage-options-button').onclick = () => router.updateHash('#stylus-options');
  $('#sync-styles').onclick = () => router.updateHash('#stylus-options');
  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));
  // show date installed & last update on hover
  installed.addEventListener('mouseover', handleEvent.lazyAddEntryTitle, {passive: true});
  installed.addEventListener('mouseout', handleEvent.lazyAddEntryTitle, {passive: true});
  document.addEventListener('visibilitychange', onVisibilityChange);
  // N.B. triggers existing onchange listeners
  setupLivePrefs();
  sorter.init();
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), () => switchUI());
  switchUI({styleOnly: true});
  // translate CSS manually
  document.styleSheets[0].insertRule(
    `:root {${[
      'updateAllCheckSucceededSomeEdited',
      'filteredStylesAllHidden',
    ].map(id => `--${id}:"${CSS.escape(t(id))}";`).join('')
    }}`);
  if (!VIVALDI) {
    $$('.filter-selection select').forEach(el => el.adjustWidth());
  }
  if (CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    addEventListener('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }
  showStyles(styles, ids);
})();

msg.onExtension(onRuntimeMessage);
router.watch({hash: '#stylus-options'}, state => (state ? embedOptions : unembedOptions)());
window.addEventListener('closeOptions', () => router.updateHash(''));

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
    case 'styleDeleted':
      bulkChangeQueue.push(msg);
      if (performance.now() - bulkChangeQueue.time < BULK_THROTTLE_MS) {
        debounce(handleBulkChange, BULK_THROTTLE_MS);
      } else {
        handleBulkChange();
      }
      break;
    case 'styleApply':
    case 'styleReplaceAll':
      break;
    default:
      return;
  }
  setTimeout(sorter.updateStripes, 0, {onlyWhenColumnsChanged: true});
}

function showStyles(styles = [], matchUrlIds) {
  const sorted = sorter.sort({
    styles: styles.map(style => {
      const name = style.customName || style.name || '';
      return {
        style,
        // sort case-insensitively the whole list then sort dupes like `Foo` and `foo` case-sensitively
        name: name.toLocaleLowerCase() + '\n' + name,
      };
    }),
  });
  let index = 0;
  let firstRun = true;
  installed.dataset.total = styles.length;
  const scrollY = (history.state || {}).scrollY;
  const shouldRenderAll = scrollY > window.innerHeight || sessionStore.justEditedStyleId;
  const renderBin = document.createDocumentFragment();
  if (scrollY) {
    renderStyles();
  } else {
    requestAnimationFrame(renderStyles);
  }

  function renderStyles() {
    const t0 = performance.now();
    while (index < sorted.length && (shouldRenderAll || performance.now() - t0 < 20)) {
      const info = sorted[index++];
      const entry = createStyleElement(info);
      if (matchUrlIds && !matchUrlIds.includes(info.style.id)) {
        entry.classList.add('not-matching');
      }
      renderBin.appendChild(entry);
    }
    filterAndAppend({container: renderBin}).then(sorter.updateStripes);
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      if (firstRun) setTimeout(getFaviconImgSrc);
      firstRun = false;
      return;
    }
    setTimeout(getFaviconImgSrc);
    if (sessionStore.justEditedStyleId) {
      highlightEditedStyle();
    } else if ('scrollY' in (history.state || {})) {
      setTimeout(window.scrollTo, 0, 0, history.state.scrollY);
    }
  }
}


function createStyleElement({style, name: nameLC}) {
  // query the sub-elements just once, then reuse the references
  if ((createStyleElement.parts || {}).newUI !== newUI.enabled) {
    const entry = newUI.tpl.getEntry();
    createStyleElement.parts = {
      newUI: newUI.enabled,
      entry,
      entryClassBase: entry.className,
      checker: $('input', entry) || {},
      nameLink: $('.style-name-link', entry),
      editLink: $('.style-edit-link', entry) || {},
      editHrefBase: 'edit.html?id=',
      homepage: $('.homepage', entry),
      homepageIcon: t.template[`homepageIcon${newUI.enabled ? 'Small' : 'Big'}`],
      infoAge: $('[data-type=age]', entry),
      infoVer: $('[data-type=version]', entry),
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
  const ud = style.usercssData;
  const configurable = ud && ud.vars && Object.keys(ud.vars).length > 0;
  const name = style.customName || style.name;
  parts.checker.checked = style.enabled;
  parts.nameLink.firstChild.textContent = t.breakWord(name);
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';
  parts.infoVer.textContent = ud ? ud.version : '';
  parts.infoVer.dataset.value = ud ? ud.version : '';
  if (newUI.enabled) {
    createAgeText(parts.infoAge, style);
  } else {
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
  entry.styleNameLowerCase = nameLC || name.toLocaleLowerCase() + '\n' + name;
  entry.styleMeta = style;
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '') +
    (ud ? ' usercss' : '');

  if (style.url) {
    $('.homepage', entry).appendChild(parts.homepageIcon.cloneNode(true));
  }
  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(t.template.updaterIcons.cloneNode(true));
  }
  if (configurable && newUI.enabled) {
    $('.actions', entry).appendChild(t.template.configureIcon.cloneNode(true));
  }

  createStyleTargetsElement({entry, style});

  return entry;
}


function createStyleTargetsElement({entry, expanded, style = entry.styleMeta}) {
  const parts = createStyleElement.parts;
  const entryTargets = $('.targets', entry);
  const expanderCls = $('.applies-to', entry).classList;
  const targets = parts.targets.cloneNode(true);
  let container = targets;
  let el = entryTargets.firstElementChild;
  let numTargets = 0;
  let allTargetsRendered = true;
  const maxTargets = expanded ? 1000 : newUI.enabled ? newUI.targets : 10;
  const displayed = new Set();
  for (const type of TARGET_TYPES) {
    for (const section of style.sections) {
      for (const targetValue of section[type] || []) {
        if (displayed.has(targetValue)) {
          continue;
        }
        if (++numTargets > maxTargets) {
          allTargetsRendered = expanded;
          break;
        }
        displayed.add(targetValue);
        const text =
          (parts.decorations[type + 'Before'] || '') +
          targetValue +
          (parts.decorations[type + 'After'] || '');
        if (el && el.dataset.type === type && el.lastChild.textContent === text) {
          const next = el.nextElementSibling;
          container.appendChild(el);
          el = next;
          continue;
        }
        const element = t.template.appliesToTarget.cloneNode(true);
        if (!newUI.enabled) {
          if (numTargets === maxTargets) {
            container = container.appendChild(t.template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(t.template.appliesToSeparator.cloneNode(true));
          }
        }
        element.dataset.type = type;
        element.appendChild(document.createTextNode(text));
        container.appendChild(element);
      }
    }
  }
  if (newUI.enabled && numTargets > newUI.targets) {
    expanderCls.add('has-more');
  }
  if (numTargets) {
    entryTargets.parentElement.replaceChild(targets, entryTargets);
  } else if (!entry.classList.contains('global') ||
             !entryTargets.firstElementChild) {
    if (entryTargets.firstElementChild) {
      entryTargets.textContent = '';
    }
    entryTargets.appendChild(t.template.appliesToEverything.cloneNode(true));
  }
  entry.classList.toggle('global', !numTargets);
  entry._allTargetsRendered = allTargetsRendered;
  entry._numTargets = numTargets;
}

function createAgeText(el, style) {
  let val = style.updateDate || style.installDate;
  if (val) {
    val = (Date.now() - val) / 3600e3; // age in hours
    for (const [max, unit, text] of AGES) {
      const rounded = Math.round(val);
      if (rounded < max) {
        el.textContent = text.replace('\x01', rounded);
        el.dataset.value = padLeft(Math.round(rounded), 2) + unit;
        break;
      }
      val /= max;
    }
  } else if (el.firstChild) {
    el.textContent = '';
    delete el.dataset.value;
  }
}

/** Adding spaces so CSS can detect "bigness" of a value via amount of spaces at the beginning */
function padLeft(val, width) {
  val = `${val}`;
  return ' '.repeat(Math.max(0, width - val.length)) + val;
}

function getFaviconImgSrc(container = installed) {
  if (!newUI.enabled || !newUI.favicons) return;
  const regexpRemoveNegativeLookAhead = /(\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)/g;
  // replace extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz
  const regexpReplaceExtraCharacters = /[\\(]|((\|\w+)+\))/g;
  const regexpMatchRegExp = /[\w-]+[.(]+(com|org|co|net|im|io|edu|gov|biz|info|de|cn|uk|nl|eu|ru)\b/g;
  const regexpMatchDomain = /^.*?:\/\/([^/]+)/;
  for (const target of $$('.target', container)) {
    const type = target.dataset.type;
    const targetValue = target.textContent;
    if (!targetValue) continue;
    let favicon = '';
    if (type === 'domains') {
      favicon = GET_FAVICON_URL + targetValue;
    } else if (targetValue.includes('chrome-extension:') || targetValue.includes('moz-extension:')) {
      favicon = OWN_ICON;
    } else if (type === 'regexps') {
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
    'input, .enable, .disable': 'toggle',
    '.style-name': 'name',
    '.homepage': 'external',
    '.check-update': 'check',
    '.update': 'update',
    '.delete': 'delete',
    '.applies-to .expander': 'expandTargets',
    '.configure-usercss': 'config',
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

  name(event, entry) {
    if (newUI.enabled) handleEvent.edit(event, entry);
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

  toggle(event, entry) {
    API.toggleStyle(entry.styleId, this.matches('.enable') || this.checked);
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
      contents: entry.styleMeta.customName || entry.styleMeta.name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button}) => {
      if (button === 0) {
        API.deleteStyle(id);
      }
    });
    const deleteButton = $('#message-box-buttons > button');
    if (deleteButton) deleteButton.removeAttribute('data-focused-via-click');
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

  expandTargets(event, entry) {
    event.preventDefault();
    if (!entry._allTargetsRendered) {
      createStyleTargetsElement({entry, expanded: true});
      setTimeout(getFaviconImgSrc, 0, entry);
    }
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
      const numTargets = newUI.targets;
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
    const cell = target.closest(REVEAL_DATES_FOR);
    if (cell) {
      const link = $('.style-name-link', cell) || cell;
      if (type === 'mouseover' && !link.title) {
        debounce(handleEvent.addEntryTitle, 50, link);
      } else {
        debounce.unregister(handleEvent.addEntryTitle);
      }
    }
  },

  addEntryTitle(link) {
    const style = link.closest('.entry').styleMeta;
    const ucd = style.usercssData;
    link.title =
      `${t('dateInstalled')}: ${t.formatDate(style.installDate) || '—'}\n` +
      `${t('dateUpdated')}: ${t.formatDate(style.updateDate) || '—'}\n` +
      (ucd ? `UserCSS, v.${ucd.version}` : '');
  },
});


function handleBulkChange() {
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
}

function handleUpdateForId(id, opts) {
  return API.getStyle(id).then(style => {
    handleUpdate(style, opts);
    bulkChangeQueue.time = performance.now();
  });
}

function handleUpdate(style, {reason, method} = {}) {
  if (reason === 'editPreview' || reason === 'editPreviewEnd') return;
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
  for (const id of newUI.ids) {
    const value = prefs.get(newUI.prefKeyForId(id));
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
  installed.classList.toggle('has-sliders', newUI.enabled && newUI.sliders);
  installed.classList.toggle('has-favicons', newUI.enabled && newUI.favicons);
  installed.classList.toggle('favicons-grayed', newUI.enabled && newUI.faviconsGray);
  if (installed.style.getPropertyValue('--num-targets') !== `${newUI.targets}`) {
    installed.style.setProperty('--num-targets', newUI.targets);
  }

  if (styleOnly) {
    return;
  }

  const iconsEnabled = newUI.enabled && newUI.favicons;
  let iconsMissing = iconsEnabled && !$('.applies-to img');
  if (changed.enabled || (iconsMissing && !createStyleElement.parts)) {
    installed.textContent = '';
    API.getAllStyles().then(showStyles);
    return;
  }
  if (changed.sliders && newUI.enabled) {
    const dst = newUI.tpl.getToggle();
    const dstChecker = $('input', dst);
    for (const entry of installed.children) {
      const src = $('.checkmate, .onoffswitch', entry);
      dstChecker.checked = entry.classList.contains('enabled');
      src.parentElement.replaceChild(dst.cloneNode(true), src);
    }
  }
  if (changed.targets) {
    for (const entry of installed.children) {
      $('.applies-to', entry).classList.toggle('has-more', entry._numTargets > newUI.targets);
      if (!entry._allTargetsRendered && newUI.targets > $('.targets', entry).childElementCount) {
        createStyleTargetsElement({entry, expanded: true});
        iconsMissing |= iconsEnabled;
      }
    }
  }
  if (iconsMissing) {
    debounce(getFaviconImgSrc);
    return;
  }
}


function onVisibilityChange() {
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


function highlightEditedStyle() {
  if (!sessionStore.justEditedStyleId) return;
  const entry = $(ENTRY_ID_PREFIX + sessionStore.justEditedStyleId);
  delete sessionStore.justEditedStyleId;
  if (entry) {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
}

function waitForSelector(selector) {
  // TODO: if used in other places, move to dom.js
  // TODO: if used concurrently, rework to use just one observer internally
  return new Promise(resolve => {
    const mo = new MutationObserver(() => {
      const el = $(selector);
      if (el) {
        mo.disconnect();
        resolve(el);
      }
    });
    mo.observe(document, {childList: true, subtree: true});
  });
}

function embedOptions() {
  const options = $('#stylus-embedded-options') ||
    document.documentElement.appendChild($create('iframe', {
      id: 'stylus-embedded-options',
      src: '/options.html',
    }));
  options.focus();
}

async function unembedOptions() {
  const options = $('#stylus-embedded-options');
  if (options) {
    options.contentWindow.document.body.classList.add('scaleout');
    await animateElement(options, 'fadeout');
    options.remove();
  }
}
