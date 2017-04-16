/* global messageBox */
'use strict';

let installed;
const filtersSelector = {
  hide: '',
  unhide: '',
};

const newUI = {
  enabled: prefs.get('manage.newUI'),
  favicons: prefs.get('manage.newUI.favicons'),
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
  $('#apply-all-updates').onclick = applyUpdateAll;
  $('#search').oninput = searchStyles;
  $('#manage-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#manage-shortcuts-button').onclick = () => openURL({url: URLS.configureCommands});
  $$('#header a[href^="http"]').forEach(a => (a.onclick = handleEvent.external));

  // focus search field on / key
  document.onkeypress = event => {
    if (event.keyCode == 47
    && !event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
    && !event.target.matches('[type="text"], [type="search"]')) {
      event.preventDefault();
      $('#search').focus();
    }
  };

  // remember scroll position on normal history navigation
  window.onbeforeunload = rememberScrollPosition;

  $$('[data-toggle-on-click]').forEach(el => {
    el.onclick = () => $(el.dataset.toggleOnClick).classList.toggle('hidden');
  });

  enforceInputRange($('#manage.newUI.targets'));

  setupLivePrefs([
    'manage.onlyEnabled',
    'manage.onlyEdited',
    'manage.newUI',
    'manage.newUI.favicons',
    'manage.newUI.targets',
  ]);

  $$('[data-filter]').forEach(el => {
    el.onchange = handleEvent.filterOnChange;
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
  const shouldRenderAll = (history.state || {}).scrollY > window.innerHeight;
  const renderBin = document.createDocumentFragment();
  renderStyles(0);

  function renderStyles(index) {
    const t0 = performance.now();
    while (index < sorted.length) {
      renderBin.appendChild(createStyleElement(sorted[index++]));
      if (!shouldRenderAll && performance.now() - t0 > 10) {
        break;
      }
    }
    filterAndAppend({container: renderBin});
    if (index < sorted.length) {
      setTimeout(renderStyles, 0, index);
    } else if (shouldRenderAll && 'scrollY' in (history.state || {})) {
      setTimeout(() => scrollTo(0, history.state.scrollY));
    }
    if (newUI.enabled && newUI.favicons) {
      debounce(handleEvent.loadFavicons, 16);
    }
  }
}


function createStyleElement({style, name}) {
  // query the sub-elements just once, then reuse the references
  if ((createStyleElement.parts || {}).newUI !== newUI.enabled) {
    const entry = template[`style${newUI.enabled ? 'Compact' : ''}`].cloneNode(true);
    createStyleElement.parts = {
      newUI: newUI.enabled,
      entry,
      entryClassBase: entry.className,
      checker: $('.checker', entry) || {},
      nameLink: $('.style-name-link', entry),
      editLink: $('.style-edit-link', entry) || {},
      editHrefBase: $('.style-name-link, .style-edit-link', entry).getAttribute('href'),
      homepage: $('.homepage', entry),
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
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '');

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
    Object.assign(filtersSelector, {
      hide: enabledFilters.map(el => '.entry:not(.hidden)' + el.dataset.filter).join(','),
      unhide: '.entry.hidden' + enabledFilters.map(el =>
        (':not(' + el.dataset.filter + ')').replace(/^:not\(:not\((.+?)\)\)$/, '$1')).join(''),
    });
    reapplyFilter();
  },
});


function handleUpdate(style, {reason} = {}) {
  const entry = createStyleElement({style});
  const oldEntry = $('#style-' + style.id);
  if (oldEntry) {
    if (oldEntry.styleNameLowerCase == entry.styleNameLowerCase) {
      installed.replaceChild(entry, oldEntry);
    } else {
      oldEntry.remove();
    }
    if (reason == 'update') {
      entry.classList.add('update-done');
      entry.classList.remove('can-update', 'updatable');
      $('.update-note', entry).textContent = t('updateCompleted');
      renderUpdatesOnlyFilter();
    }
  }
  filterAndAppend({entry});
  if (!entry.classList.contains('hidden') && reason != 'import') {
    animateElement(entry, {className: 'highlight'});
    scrollElementIntoView(entry);
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
  const enabled = $('#manage.newUI').checked;
  const favicons = $('#manage.newUI.favicons').checked;
  const targets = Number($('#manage.newUI.targets').value);

  const stateToggled = newUI.enabled != enabled;
  const targetsChanged = enabled && targets != newUI.targets;
  const faviconsChanged = enabled && favicons != newUI.favicons;
  const missingFavicons = enabled && favicons && !$('.applies-to img');

  if (!styleOnly && !stateToggled && !targetsChanged && !faviconsChanged) {
    return;
  }

  Object.assign(newUI, {enabled, favicons, targets});

  newUI.renderClass();
  installed.classList.toggle('has-favicons', favicons);
  $('#style-overrides').textContent = `
    .newUI .targets {
      max-height: ${newUI.targets * 18}px;
    }
  `;

  if (styleOnly) {
    return;
  }

  if (stateToggled || missingFavicons && !createStyleElement.parts) {
    installed.innerHTML = '';
    getStylesSafe().then(showStyles);
    return;
  }
  if (targetsChanged) {
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
  }, 1000);

  $$('.can-update .update').forEach(button => {
    scrollElementIntoView(button);
    button.click();
  });

  renderUpdatesOnlyFilter({show: false});
}


function checkUpdateAll() {
  const btnCheck = $('#check-all-updates');
  const btnApply = $('#apply-all-updates');
  const noUpdates = $('#update-all-no-updates');
  const progress = $('#update-progress');

  btnCheck.disabled = true;
  btnApply.classList.add('hidden');
  noUpdates.classList.add('hidden');
  const maxWidth = progress.parentElement.clientWidth;

  const queue = $$('.updatable:not(.can-update)').map(checkUpdate);
  const total = queue.length;
  let updatesFound = false;
  let checked = 0;
  processQueue();
  // notify the automatic updater to reset the next automatic update accordingly
  chrome.runtime.sendMessage({
    method: 'resetInterval'
  });

  function processQueue(status) {
    if (status === true) {
      updatesFound = true;
      btnApply.disabled = true;
      btnApply.classList.remove('hidden');
      renderUpdatesOnlyFilter({check: true});
    }
    if (checked < total) {
      queue[checked++].then(status => {
        progress.style.width = Math.round(checked / total * maxWidth) + 'px';
        setTimeout(processQueue, 0, status);
      });
      return;
    }
    btnCheck.disabled = false;
    btnApply.disabled = false;
    if (!updatesFound) {
      noUpdates.classList.remove('hidden');
      setTimeout(() => {
        noUpdates.classList.add('hidden');
      }, 10e3);
    }
  }
}


function checkUpdate(element) {
  $('.update-note', element).textContent = t('checkingForUpdate');
  $('.check-update', element).title = '';
  element.classList.remove('checking-update', 'no-update', 'update-problem');
  element.classList.add('checking-update');
  return new Updater(element).run(); // eslint-disable-line no-use-before-define
}


class Updater {
  constructor(element) {
    const style = BG.cachedStyles.byId.get(element.styleId);
    Object.assign(this, {
      element,
      id: style.id,
      url: style.updateUrl,
      md5Url: style.md5Url,
      md5: style.originalMd5,
    });
  }

  run() {
    return this.md5Url && this.md5
      ? this.checkMd5()
      : this.checkFullCode();
  }

  checkMd5() {
    return Updater.download(this.md5Url).then(
      md5 => (md5.length == 32
        ? this.decideOnMd5(md5 != this.md5)
        : this.onFailure(-1)),
      status => this.onFailure(status));
  }

  decideOnMd5(md5changed) {
    if (md5changed) {
      return this.checkFullCode({forceUpdate: true});
    }
    this.display();
  }

  checkFullCode({forceUpdate = false} = {}) {
    return Updater.download(this.url).then(
      text => this.handleJson(forceUpdate, JSON.parse(text)),
      status => this.onFailure(status));
  }

  handleJson(forceUpdate, json) {
    return getStylesSafe({id: this.id}).then(([style]) => {
      const needsUpdate = forceUpdate || !BG.styleSectionsEqual(style, json);
      this.display({json: needsUpdate && json});
      return needsUpdate;
    });
  }

  onFailure(status) {
    this.display({
      message: status == 0
        ? t('updateCheckFailServerUnreachable')
        : t('updateCheckFailBadResponseCode', [status]),
    });
  }

  display({json, message} = {}) {
    // json on success
    // message on failure
    // none on update not needed
    this.element.classList.remove('checking-update');
    if (json) {
      this.element.classList.add('can-update');
      this.element.updatedCode = json;
      $('.update-note', this.element).textContent = '';
      $('#onlyUpdates').classList.remove('hidden');
    } else {
      this.element.classList.add('no-update');
      this.element.classList.toggle('update-problem', Boolean(message));
      $('.update-note', this.element).textContent = message || t('updateCheckSucceededNoUpdate');
      if (newUI.enabled) {
        $('.check-update', this.element).title = message;
      }
      // don't hide if check-all is running
      if (!$('#check-all-updates').disabled) {
        $('#onlyUpdates').classList.toggle('hidden', !$('.can-update'));
      }
    }
    if (filtersSelector.hide) {
      filterAndAppend({entry: this.element});
    }
  }

  static download(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onloadend = () => (xhr.status == 200
        ? resolve(xhr.responseText)
        : reject(xhr.status));
      if (url.length > 2000) {
        const [mainUrl, query] = url.split('?');
        xhr.open('POST', mainUrl, true);
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        xhr.send(query);
      } else {
        xhr.open('GET', url);
        xhr.send();
      }
    });
  }

}


function renderUpdatesOnlyFilter({show, check} = {}) {
  const numUpdatable = $$('.can-update').length;
  const canUpdate = numUpdatable > 0;
  const checkbox = $('#onlyUpdates input');
  show = show !== undefined ? show : canUpdate;
  check = check !== undefined ? show && check : checkbox.checked && canUpdate;

  $('#onlyUpdates').classList.toggle('hidden', !show);
  checkbox.checked = check;
  checkbox.dispatchEvent(new Event('change'));

  const btnApply = $('#apply-all-updates');
  if (!btnApply.matches('.hidden')) {
    if (canUpdate) {
      btnApply.dataset.value = numUpdatable;
    } else {
      btnApply.classList.add('hidden');
    }
  }
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
    container = document.createElement('div');
    container.appendChild(entry);
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
  $('#check-all-updates').disabled = !$('.updatable:not(.can-update)');
  // A: show
  const toUnhide = filtersSelector.hide ? $$(filtersSelector.unhide, container) : container;
  // showStyles() is building the page and no filters are active
  if (toUnhide instanceof DocumentFragment) {
    installed.appendChild(toUnhide);
    return;
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
  const toHide = filtersSelector.hide ? $$(filtersSelector.hide, container) : [];
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

  function shuffle(fullPass) {
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
