/* global messageBox */
'use strict';

let installed;

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


chrome.runtime.onMessage.addListener(msg => {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
      handleUpdate(msg.style, msg);
      break;
    case 'styleDeleted':
      handleDelete(msg.id);
      break;
  }
});


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

  for (const [className, checkbox] of [
    ['enabled-only', $('#manage.onlyEnabled')],
    ['edited-only', $('#manage.onlyEdited')],
    ['updates-only', $('#onlyUpdates input')],
  ]) {
    // will be triggered by setupLivePrefs immediately
    checkbox.onchange = () => installed.classList.toggle(className, checkbox.checked);
  }

  enforceInputRange($('#manage.newUI.favicons'));

  setupLivePrefs([
    'manage.onlyEnabled',
    'manage.onlyEdited',
    'manage.newUI',
    'manage.newUI.favicons',
    'manage.newUI.targets',
  ]);

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
    if ($('#search').value) {
      // re-apply filtering on history Back
      searchStyles({immediately: true, container: renderBin});
    }
    installed.appendChild(renderBin);
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
      checker: $('.checker', entry),
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
  Object.assign(parts.entry, {
    className: parts.entryClassBase + ' ' +
      (style.enabled ? 'enabled' : 'disabled') +
      (style.updateUrl ? ' updatable' : ''),
    id: 'style-' + style.id,
    styleId: style.id,
    styleNameLowerCase: name || style.name.toLocaleLowerCase(),
  });

  parts.nameLink.textContent = style.name;
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';

  // .targets may be a large list so we clone it separately
  // and paste into the cloned entry in the end
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
    parts.checker.checked = style.enabled;
    parts.appliesTo.classList.toggle('has-more', numTargets > newUI.targets);
    // name is supplied by showStyles so we let it decide when to load the icons
    if (numIcons && !name) {
      debounce(handleEvent.loadFavicons);
    }
  }

  const newEntry = parts.entry.cloneNode(true);
  const newTargets = $('.targets', newEntry);
  if (numTargets) {
    newTargets.parentElement.replaceChild(targets, newTargets);
  } else {
    newTargets.appendChild(template.appliesToEverything.cloneNode(true));
    newEntry.classList.add('global');
  }
  return newEntry;
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
    enableStyle(entry.styleId, this.matches('.enable') || this.checked);
  },

  check(event, entry) {
    checkUpdate(entry);
  },

  update(event, entry) {
    // update everything but name
    saveStyle(Object.assign(entry.updatedCode, {
      id: entry.styleId,
      name: null,
      reason: 'update',
    }));
  },

  delete(event, entry) {
    const id = entry.styleId;
    const {name} = cachedStyles.byId.get(id) || {};
    animateElement(entry, {className: 'highlight'});
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: name,
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button, enter, esc}) => {
      if (button == 0 || enter) {
        deleteStyle(id);
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

  loadFavicons(container = installed) {
    for (const img of container.getElementsByTagName('img')) {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
    }
  }
});


function handleUpdate(style, {reason, quiet} = {}) {
  const element = createStyleElement({style});
  const oldElement = $('#style-' + style.id, installed);
  if (oldElement) {
    if (oldElement.styleNameLowerCase == element.styleNameLowerCase) {
      installed.replaceChild(element, oldElement);
    } else {
      oldElement.remove();
    }
    if (reason == 'update') {
      element.classList.add('update-done');
      element.classList.remove('can-update', 'updatable');
      $('.update-note', element).innerHTML = t('updateCompleted');
      renderUpdatesOnlyFilter();
    }
  }
  installed.insertBefore(element, findNextElement(style));
  if (reason != 'import') {
    animateElement(element, {className: 'highlight'});
  }
  scrollElementIntoView(element);
}


function handleDelete(id) {
  const node = $('#style-' + id, installed);
  if (node) {
    node.remove();
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

  if (!styleOnly && (stateToggled || missingFavicons)) {
    installed.innerHTML = '';
    getStylesSafe().then(showStyles);
  } else if (targetsChanged) {
    for (const targets of $$('.entry .targets')) {
      const hasMore = targets.children.length > newUI.targets;
      targets.parentElement.classList.toggle('has-more', hasMore);
    }
  }
}


function applyUpdateAll() {
  const btnApply = $('#apply-all-updates');
  btnApply.disabled = true;
  setTimeout(() => {
    btnApply.style.display = 'none';
    btnApply.disabled = false;
  }, 1000);

  $$('.can-update .update').forEach(button => {
    // align to the bottom of the visible area if wasn't visible
    button.scrollIntoView(false);
    button.click();
  });

  renderUpdatesOnlyFilter({show: false});
}


function checkUpdateAll() {
  const btnCheck = $('#check-all-updates');
  const btnApply = $('#apply-all-updates');
  const noUpdates = $('#update-all-no-updates');

  btnCheck.disabled = true;
  btnApply.classList.add('hidden');
  noUpdates.classList.add('hidden');

  Promise.all($$('.updatable:not(.can-update)').map(checkUpdate))
    .then(updatables => {
      btnCheck.disabled = false;
      const numUpdatable = updatables.filter(u => u).length;
      if (numUpdatable) {
        btnApply.classList.remove('hidden');
        btnApply.originalLabel = btnApply.originalLabel || btnApply.textContent;
        btnApply.textContent = btnApply.originalLabel + ` (${numUpdatable})`;
        renderUpdatesOnlyFilter({check: true});
      } else {
        noUpdates.classList.remove('hidden');
        setTimeout(() => {
          noUpdates.classList.add('hidden');
        }, 10e3);
      }
    });

  // notify the automatic updater to reset the next automatic update accordingly
  chrome.runtime.sendMessage({
    method: 'resetInterval'
  });
}


function checkUpdate(element) {
  $('.update-note', element).innerHTML = t('checkingForUpdate');
  $('.check-update', element).title = '';
  element.classList.remove('checking-update', 'no-update', 'update-problem');
  element.classList.add('checking-update');
  return new Updater(element).run(); // eslint-disable-line no-use-before-define
}


class Updater {
  constructor(element) {
    const style = cachedStyles.byId.get(element.styleId);
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
      const needsUpdate = forceUpdate || !styleSectionsEqual(style, json);
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
      $('.update-note', this.element).innerHTML = '';
      $('#onlyUpdates').classList.remove('hidden');
    } else {
      this.element.classList.add('no-update');
      this.element.classList.toggle('update-problem', Boolean(message));
      $('.update-note', this.element).innerHTML = message || t('updateCheckSucceededNoUpdate');
      if (newUI.enabled) {
        $('.check-update', this.element).title = message;
      }
      // don't hide if check-all is running
      if (!$('#check-all-updates').disabled) {
        $('#onlyUpdates').classList.toggle('hidden', !$('.can-update'));
      }
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
      btnApply.textContent = btnApply.originalLabel + ` (${numUpdatable})`;
    } else {
      btnApply.classList.add('hidden');
    }
  }
}


function searchStyles({immediately, container}) {
  const query = $('#search').value.toLocaleLowerCase();
  if (query == (searchStyles.lastQuery || '') && !immediately && !container) {
    return;
  }
  searchStyles.lastQuery = query;
  if (!immediately) {
    clearTimeout(searchStyles.timeout);
    searchStyles.timeout = setTimeout(searchStyles, 150, {immediately: true});
    return;
  }

  for (const element of (container || installed).children) {
    const style = cachedStyles.byId.get(element.styleId) || {};
    if (style) {
      const isMatching = !query
        || isMatchingText(style.name)
        || style.url && isMatchingText(style.url)
        || isMatchingStyle(style);
      element.style.display = isMatching ? '' : 'none';
    }
  }

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


function rememberScrollPosition() {
  history.replaceState({scrollY: window.scrollY}, document.title);
}


function findNextElement(style) {
  const nameLLC = style.name.toLocaleLowerCase();
  const elements = installed.children;
  let a = 0;
  let b = elements.length - 1;
  if (b < 0) {
    return undefined;
  }
  if (elements[0].styleNameLowerCase > nameLLC) {
    return elements[0];
  }
  if (elements[b].styleNameLowerCase <= nameLLC) {
    return undefined;
  }
  // bisect
  while (a < b - 1) {
    const c = (a + b) / 2 | 0;
    if (nameLLC < elements[c].styleNameLowerCase) {
      b = c;
    } else {
      a = c;
    }
  }
  if (elements[a].styleNameLowerCase > nameLLC) {
    return elements[a];
  }
  while (a <= b && elements[a].name < nameLLC) {
    a++;
  }
  return elements[elements[a].styleNameLowerCase <= nameLLC ? a + 1 : a];
}
