/* global messageBox */
'use strict';

const installed = $('#installed');
const TARGET_LABEL = t('appliesDisplay', '').trim();
const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps'];
const TARGET_LIMIT = 10;


getStylesSafe()
  .then(showStyles)
  .then(initGlobalEvents);


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
  $('#check-all-updates').onclick = checkUpdateAll;
  $('#apply-all-updates').onclick = applyUpdateAll;
  $('#search').oninput = searchStyles;
  $('#manage-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#manage-shortcuts-button').onclick = configureCommands.open;
  $$('#header a[href^="http"]').forEach(a => (a.onclick = EntryOnClick.external));

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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState != 'visible') {
      rememberScrollPosition();
    }
  });

  setupLivePrefs([
    'manage.onlyEnabled',
    'manage.onlyEdited',
  ]);

  [
    ['enabled-only', $('#manage.onlyEnabled')],
    ['edited-only', $('#manage.onlyEdited')],
  ]
  .forEach(([className, checkbox]) => {
    checkbox.onchange = () => installed.classList.toggle(className, checkbox.checked);
    checkbox.onchange();
  });
}


function showStyles(styles = []) {
  const sorted = styles
    .map(style => ({name: style.name.toLocaleLowerCase(), style}))
    .sort((a, b) => (a.name < b.name ? -1 : a.name == b.name ? 0 : 1));
  const shouldRenderAll = history.state && history.state.scrollY > innerHeight;
  const renderBin = document.createDocumentFragment();
  tDocLoader.stop();
  renderStyles(0);
  // TODO: remember how many styles fit one page to display just that portion first next time
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
    } else if (shouldRenderAll && history.state && 'scrollY' in history.state) {
      setTimeout(() => scrollTo(0, history.state.scrollY));
    }
  }
}


// silence the inapplicable warning for async code
/* eslint no-use-before-define: [2, {"functions": false, "classes": false}] */
function createStyleElement({style, name}) {
  const entry = template.style.cloneNode(true);
  entry.classList.add(style.enabled ? 'enabled' : 'disabled');
  entry.setAttribute('style-id', style.id);
  entry.id = 'style-' + style.id;
  entry.styleId = style.id;
  entry.styleNameLowerCase = name || style.name.toLocaleLowerCase();
  if (style.updateUrl) {
    entry.setAttribute('style-update-url', style.updateUrl);
  }
  if (style.md5Url) {
    entry.setAttribute('style-md5-url', style.md5Url);
  }
  if (style.originalMd5) {
    entry.setAttribute('style-original-md5', style.originalMd5);
  }

  const styleName = $('.style-name', entry);
  const styleNameEditLink = $('a', styleName);
  styleNameEditLink.appendChild(document.createTextNode(style.name));
  styleNameEditLink.href = styleNameEditLink.getAttribute('href') + style.id;
  styleNameEditLink.onclick = EntryOnClick.edit;
  if (style.url) {
    const homepage = template.styleHomepage.cloneNode(true);
    homepage.href = style.url;
    homepage.onclick = EntryOnClick.external;
    styleName.appendChild(document.createTextNode(' '));
    styleName.appendChild(homepage);
  }

  const targets = new Map(TARGET_TYPES.map(t => [t, new Set()]));
  const decorations = {
    urlPrefixesAfter: '*',
    regexpsBefore: '/',
    regexpsAfter: '/',
  };
  for (const [name, target] of targets.entries()) {
    for (const section of style.sections) {
      for (const targetValue of section[name] || []) {
        target.add(
          (decorations[name + 'Before'] || '') +
          targetValue.trim() +
          (decorations[name + 'After'] || ''));
      }
    }
  }
  const appliesTo = $('.applies-to', entry);
  appliesTo.firstElementChild.textContent = TARGET_LABEL;
  const targetsList = Array.prototype.concat.apply([],
    [...targets.values()].map(set => [...set.values()]));
  if (!targetsList.length) {
    appliesTo.appendChild(template.appliesToEverything.cloneNode(true));
    entry.classList.add('global');
  } else {
    let index = 0;
    let container = appliesTo;
    for (const target of targetsList) {
      if (index > 0) {
        container.appendChild(template.appliesToSeparator.cloneNode(true));
      }
      if (++index == TARGET_LIMIT) {
        container = appliesTo.appendChild(template.extraAppliesTo.cloneNode(true));
      }
      const item = template.appliesToTarget.cloneNode(true);
      item.textContent = target;
      container.appendChild(item);
    }
  }

  const editLink = $('.style-edit-link', entry);
  editLink.href = editLink.getAttribute('href') + style.id;
  editLink.onclick = EntryOnClick.edit;

  $('.enable', entry).onclick = EntryOnClick.toggle;
  $('.disable', entry).onclick = EntryOnClick.toggle;
  $('.check-update', entry).onclick = EntryOnClick.check;
  $('.update', entry).onclick = EntryOnClick.update;
  $('.delete', entry).onclick = EntryOnClick.delete;
  return entry;
}

class EntryOnClick {

  static edit(event) {
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
  }

  static toggle(event) {
    enableStyle(getClickedStyleId(event), this.matches('.enable'))
      .then(handleUpdate);
  }

  static check(event) {
    checkUpdate(getClickedStyleElement(event));
  }

  static update(event) {
    const styleElement = getClickedStyleElement(event);
    // update everything but name
    saveStyle(Object.assign(styleElement.updatedCode, {
      id: styleElement.styleId,
      name: null,
      reason: 'update',
    }));
  }

  static delete(event) {
    const styleElement = getClickedStyleElement(event);
    const id = styleElement.styleId;
    const {name} = cachedStyles.byId.get(id) || {};
    animateElement(styleElement, {className: 'highlight'});
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
  }

  static external(event) {
    openURL({url: event.target.closest('a').href});
    event.preventDefault();
  }
}


function handleUpdate(style, {reason} = {}) {
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
      $('.update-note', element).innerHTML = t('updateCompleted');
    }
  }
  installed.insertBefore(element, findNextElement(style));
  animateElement(element, {className: 'highlight'});
  scrollElementIntoView(element);
}


function handleDelete(id) {
  const node = $('#style-' + id, installed);
  if (node) {
    node.remove();
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
}


function checkUpdateAll() {
  const btnCheck = $('#check-all-updates');
  const btnApply = $('#apply-all-updates');
  const noUpdates = $('#update-all-no-updates');

  btnCheck.disabled = true;
  btnApply.classList.add('hidden');
  noUpdates.classList.add('hidden');

  Promise.all($$('[style-update-url]').map(checkUpdate))
    .then(updatables => {
      btnCheck.disabled = false;
      if (updatables.includes(true)) {
        btnApply.classList.remove('hidden');
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
  element.classList.remove('checking-update', 'no-update', 'can-update');
  element.classList.add('checking-update');
  return new Updater(element).run();
}


class Updater {
  constructor(element) {
    Object.assign(this, {
      element,
      id: element.styleId,
      url: element.getAttribute('style-update-url'),
      md5Url: element.getAttribute('style-md5-url'),
      md5: element.getAttribute('style-original-md5'),
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
      this.onFailure);
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
      this.onFailure);
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
    } else {
      this.element.classList.add('no-update');
      $('.update-note', this.element).innerHTML = message || t('updateCheckSucceededNoUpdate');
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
  history.replaceState({scrollY}, document.title);
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
