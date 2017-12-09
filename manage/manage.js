/* global messageBox, getStyleWithNoCode, retranslateCSS */
/* global filtersSelector, filterAndAppend */
/* global checkUpdate, handleUpdateInstalled */
/* global objectDiff */
/* global configDialog */
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
  const sorted = styles
    .map(style => ({name: style.name.toLocaleLowerCase(), style}))
    .sort((a, b) => (a.name < b.name ? -1 : a.name === b.name ? 0 : 1));
  let index = 0;
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
      (shouldRenderAll || ++rendered < 10 || performance.now() - t0 < 10)
    ) {
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

  if (style.url) {
    $('.homepage', entry).appendChild(parts.homepageIcon.cloneNode(true));
  } else {
    $('.homepage', entry).removeAttribute('href');
    $('.homepage', entry).classList.add('disabled');
  }
  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(template.updaterIcons.cloneNode(true));
  }
  if (style.usercssData && Object.keys(style.usercssData.vars).length > 0 && newUI.enabled) {
    $('.actions', entry).appendChild(template.configureIcon.cloneNode(true));
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

  loadFavicons(container = document.body) {
    for (const img of $$('img', container)) {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
    }
  },

  config(event, {styleMeta}) {
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
          createStyleTargetsElement({entry, style, postponeFavicons: true});
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
