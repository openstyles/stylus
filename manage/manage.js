/* global messageBox, getStyleWithNoCode, retranslateCSS */
/* global filtersSelector, filterAndAppend */
/* global checkUpdate, handleUpdateInstalled */
/* global objectDiff */
/* global configDialog */
/* global sorter */
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
usePrefsDuringPageLoad();

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

dieOnNullBackground();

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
  $('#manage-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#manage-shortcuts-button').onclick = () => openURL({url: URLS.configureCommands});
  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));
  // show date installed & last update on hover
  installed.addEventListener('mouseover', debounceEntryTitle);
  installed.addEventListener('mouseout', debounceEntryTitle);

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
  sorter().init();

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


function showStyles(styles = []) {
  const sorted = sorter().sort({
    parser: 'style',
    styles: styles.map(style => ({
      style,
      name: style.name.toLocaleLowerCase(),
    })),
  }).map((info, index) => {
    info.index = index;
    return info;
  });
  let index = 0;
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
      renderBin.appendChild(createStyleElement(sorted[index++]));
    }
    filterAndAppend({container: renderBin});
    if (newUI.enabled && newUI.favicons) {
      debounce(handleEvent.loadFavicons);
    }
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      return;
    }
    if ('scrollY' in (history.state || {}) && !sessionStorage.justEditedStyleId) {
      setTimeout(window.scrollTo, 0, 0, history.state.scrollY);
    }
    if (sessionStorage.justEditedStyleId) {
      const entry = $(ENTRY_ID_PREFIX + sessionStorage.justEditedStyleId);
      delete sessionStorage.justEditedStyleId;
      if (entry) {
        animateElement(entry);
        scrollElementIntoView(entry);
      }
    }
  }
}


function createStyleElement({style, name, index}) {
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
    };
  }
  const parts = createStyleElement.parts;
  parts.checker.checked = style.enabled;
  parts.nameLink.textContent = tWordBreak(style.name);
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';

  const entry = parts.entry.cloneNode(true);
  entry.id = ENTRY_ID_PREFIX_RAW + style.id;
  entry.styleId = style.id;
  entry.styleNameLowerCase = name || style.name.toLocaleLowerCase();
  entry.styleMeta = getStyleWithNoCode(style);
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '') +
    (style.usercssData ? ' usercss' : '');
  entry.dataset.installdate = style.installDate || t('genericUnknown');
  entry.dataset.updatedate = style.updateDate || style.installDate || t('genericUnknown');
  if (index !== undefined) entry.classList.add(index % 2 ? 'odd' : 'even');

  if (style.url) {
    $('.homepage', entry).appendChild(parts.homepageIcon.cloneNode(true));
  }
  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(template.updaterIcons.cloneNode(true));
  }
  if (style.usercssData && Object.keys(style.usercssData.vars).length > 0 && newUI.enabled) {
    $('.actions', entry).appendChild(template.configureIcon.cloneNode(true));
  }

  createStyleTargetsElement({entry, style});

  return entry;
}


function debounceEntryTitle(event) {
  if (event.target.nodeName === 'H2' && event.target.classList.contains('style-name')) {
    const link = $('.style-name-link', event.target);
    if (event.type === 'mouseover' && !link.title) {
      debounce(addEntryTitle, 50, link);
    } else if (debounce.timers.size) {
      debounce.unregister(addEntryTitle);
    }
  }
}

// Add entry install & updated date to  process locales
function addEntryTitle(link) {
  const unknown = t('genericUnknown');
  const entry = link.closest('.entry');
  // eslint-disable-next-line no-inner-declarations
  function checkValidDate(date) {
    const check = formatDate(date);
    return (date === unknown || check === 'Invalid Date') ? unknown : check;
  }
  if (entry) {
    link.title = `${t('dateInstalled')}: ${checkValidDate(entry.dataset.installdate)}\n` +
      `${t('dateUpdated')}: ${checkValidDate(entry.dataset.updatedate)}`;
  }
}


function createStyleTargetsElement({entry, style}) {
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
          if (numTargets === 10) {
            container = container.appendChild(template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(template.appliesToSeparator.cloneNode(true));
          }
        } else if (newUI.favicons) {
          let favicon = '';
          if (type === 'domains') {
            favicon = GET_FAVICON_URL + targetValue;
          } else if (targetValue.startsWith('chrome-extension:')) {
            favicon = OWN_ICON;
          } else if (type !== 'regexps') {
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
    '.style-name': 'edit',
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
    event.preventDefault();
    checkUpdate(entry);
  },

  update(event, entry) {
    event.preventDefault();
    const request = Object.assign(entry.updatedCode, {
      id: entry.styleId,
      reason: 'update',
    });
    if (entry.updatedCode.usercssData) {
      onBackgroundReady()
        .then(() => BG.usercssHelper.save(request));
    } else {
      // update everything but name
      request.name = null;
      saveStyleSafe(request);
    }
  },

  delete(event, entry) {
    event.preventDefault();
    const id = entry.styleId;
    const {name} = BG.cachedStyles.byId.get(id) || {};
    animateElement(entry);
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button}) => {
      if (button === 0) {
        deleteStyleSafe({id});
      }
    });
  },

  external(event) {
    openURL({url: event.target.closest('a').href});
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
});


function handleUpdate(style, {reason, method} = {}) {
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
  if (reason === 'update' || reason === 'install' && entry.matches('.updatable')) {
    handleUpdateInstalled(entry, reason);
  }
  filterAndAppend({entry});
  sorter().update();
  if (!entry.matches('.hidden') && reason !== 'import') {
    animateElement(entry);
    scrollElementIntoView(entry);
  }

  function handleToggledOrCodeOnly() {
    const newStyleMeta = getStyleWithNoCode(style);
    const diff = objectDiff(oldEntry.styleMeta, newStyleMeta);
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
    installed.textContent = '';
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
        const entry = $(ENTRY_ID_PREFIX + style.id);
        if (entry) {
          createStyleTargetsElement({entry, style});
        }
      }
      debounce(handleEvent.loadFavicons);
    });
    return;
  }
}


function rememberScrollPosition() {
  history.replaceState({scrollY: window.scrollY}, document.title);
}


function usePrefsDuringPageLoad() {
  const observer = new MutationObserver(mutations => {
    const adjustedNodes = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        // [naively] assuming each element of addedNodes is a childless element
        const key = node.dataset && node.dataset.pref || node.id;
        const prefValue = key ? prefs.readOnlyValues[key] : undefined;
        if (prefValue !== undefined) {
          if (node.type === 'checkbox') {
            node.checked = prefValue;
          } else if (node.localName === 'details') {
            node.open = prefValue;
          } else {
            node.value = prefValue;
          }
          if (node.adjustWidth) {
            adjustedNodes.push(node);
          }
        }
      }
    }
    if (adjustedNodes.length) {
      observer.disconnect();
      for (const node of adjustedNodes) {
        node.adjustWidth();
      }
      startObserver();
    }
  });
  function startObserver() {
    observer.observe(document, {subtree: true, childList: true});
  }
  startObserver();
  onDOMready().then(() => observer.disconnect());
}


// TODO: remove when these bugs are fixed in FF
function dieOnNullBackground() {
  if (!FIREFOX || BG) {
    return;
  }
  sendMessage({method: 'healthCheck'}, health => {
    if (health && !chrome.extension.getBackgroundPage()) {
      onDOMready().then(() => {
        sendMessage({method: 'getStyles'}, showStyles);
        messageBox({
          title: 'Stylus',
          className: 'danger center',
          contents: t('dysfunctionalBackgroundConnection'),
          onshow: () => {
            $('#message-box-close-icon').remove();
            window.removeEventListener('keydown', messageBox.listeners.key, true);
          }
        });
        document.documentElement.style.pointerEvents = 'none';
      });
    }
  });
}
