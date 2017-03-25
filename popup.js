/* globals configureCommands, openURL */

const RX_SUPPORTED_URLS = new RegExp(
  `^(file|https?|ftps?):|^${OWN_ORIGIN}`);
let installed;


getActiveTabRealURL().then(url => {
  const isUrlSupported = RX_SUPPORTED_URLS.test(url);
  Promise.all([
    isUrlSupported ? getStylesSafe({matchUrl: url}) : null,
    onDOMready().then(() => initPopup(isUrlSupported ? url : '')),
  ])
    .then(([styles]) => styles && showStyles(styles));
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.method == 'updatePopup') {
    switch (msg.reason) {
      case 'styleAdded':
      case 'styleUpdated':
        handleUpdate(msg.style);
        break;
      case 'styleDeleted':
        handleDelete(msg.id);
        break;
    }
  }
});


function initPopup(url) {
  installed = $('#installed');

  // popup width
  document.body.style.width =
    Math.max(200, Math.min(800, Number(localStorage.popupWidth) || 246)) + 'px';

  // action buttons
  $('#disableAll').onchange = () =>
    installed.classList.toggle('disabled', prefs.get('disableAll'));
  setupLivePrefs(['disableAll']);
  $('#find-styles-link').onclick = openURLandHide;
  $('#popup-manage-button').href = 'manage.html';
  $('#popup-manage-button').onclick = openURLandHide;
  $('#popup-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#popup-shortcuts-button').onclick = configureCommands.open;

  // styles first?
  if (!prefs.get('popup.stylesFirst')) {
    document.body.insertBefore(
      $('body > .actions'),
      installed);
  }

  // find styles link
  $('#find-styles a').href =
    'https://userstyles.org/styles/browse/all/' +
    encodeURIComponent(url.startsWith('file:') ? 'file:' : url);

  if (!url) {
    document.body.classList.add('blocked');
    return;
  }

  // Write new style links
  const writeStyle = $('#write-style');
  const matchTargets = document.createElement('span');
  matchTargets.id = 'match';

  // For this URL
  const urlLink = template.writeStyle.cloneNode(true);
  Object.assign(urlLink, {
    href: 'edit.html?url-prefix=' + encodeURIComponent(url),
    title: `url-prefix("${url}")`,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? new URL(url).pathname.slice(1)
      : t('writeStyleForURL').replace(/ /g, '\u00a0'), // this&nbsp;URL
    onclick: openLinkInTabOrWindow,
  });
  if (prefs.get('popup.breadcrumbs')) {
    urlLink.onmouseenter =
      urlLink.onfocus = () => urlLink.parentNode.classList.add('url()');
    urlLink.onmouseleave =
      urlLink.onblur = () => urlLink.parentNode.classList.remove('url()');
  }
  matchTargets.appendChild(urlLink);

  // For domain
  const domains = getDomains(url);
  for (let domain of domains) {
    // Don't include TLD
    if (domains.length > 1 && !domain.includes('.')) {
      continue;
    }
    const domainLink = template.writeStyle.cloneNode(true);
    Object.assign(domainLink, {
      href: 'edit.html?domain=' + encodeURIComponent(domain),
      textContent: domain,
      title: `domain("${domain}")`,
      onclick: openLinkInTabOrWindow,
    });
    domainLink.setAttribute('subdomain', domain.substring(0, domain.indexOf('.')));
    matchTargets.appendChild(domainLink);
  }

  if (prefs.get('popup.breadcrumbs')) {
    matchTargets.classList.add('breadcrumbs');
    matchTargets.appendChild(matchTargets.removeChild(matchTargets.firstElementChild));
  }
  writeStyle.appendChild(matchTargets);
}


function showStyles(styles) {
  if (!styles.length) {
    installed.innerHTML = template.noStyles.outerHTML;
  } else {
    const enabledFirst = prefs.get('popup.enabledFirst');
    styles.sort((a, b) =>
      enabledFirst && a.enabled !== b.enabled
        ? !(a.enabled < b.enabled) ? -1 : 1
        : a.name.localeCompare(b.name));
    const fragment = document.createDocumentFragment();
    for (let style of styles) {
      fragment.appendChild(createStyleElement(style));
    }
    installed.appendChild(fragment);
  }
  // force Chrome to resize the popup
  document.body.style.height = '10px';
  document.documentElement.style.height = '10px';
}


function createStyleElement(style) {
  const entry = template.style.cloneNode(true);
  entry.setAttribute('style-id', style.id);
  Object.assign(entry, {
    styleId: style.id,
    className: entry.className + ' ' + (style.enabled ? 'enabled' : 'disabled'),
    onmousedown: openEditorOnMiddleclick,
    onauxclick: openEditorOnMiddleclick,
  });

  const checkbox = $('.checker', entry);
  Object.assign(checkbox, {
    id: 'style-' + style.id,
    checked: style.enabled,
    onclick: EntryOnClick.toggle,
  });

  const editLink = $('.style-edit-link', entry);
  Object.assign(editLink, {
    href: editLink.getAttribute('href') + style.id,
    onclick: openLinkInTabOrWindow,
  });

  const styleName = $('.style-name', entry);
  Object.assign(styleName, {
    htmlFor: 'style-' + style.id,
    onclick: EntryOnClick.name,
  });
  styleName.checkbox = checkbox;
  styleName.appendChild(document.createTextNode(style.name));

  $('.enable', entry).onclick = EntryOnClick.toggle;
  $('.disable', entry).onclick = EntryOnClick.toggle;
  $('.delete', entry).onclick = EntryOnClick.delete;

  return entry;
}


class EntryOnClick {

  static name(event) {
    this.checkbox.click();
    event.preventDefault();
  }

  static toggle(event) {
    saveStyle({
      id: getClickedStyleId(event),
      enabled: this.type == 'checkbox' ? this.checked : this.matches('.enable'),
    });
  }

  static delete(event) {
    confirmDelete(event).then(() => {
      // update view with 'No styles installed for this site' message
      if (!installed.children.length) {
        showStyles([]);
      }
    });
  }

}


function openLinkInTabOrWindow(event) {
  if (!prefs.get('openEditInWindow', false)) {
    openURLandHide(event);
    return;
  }
  event.preventDefault();
  chrome.windows.create(
    Object.assign({
      url: event.target.href
    }, prefs.get('windowPosition', {}))
  );
  close();
}


function openEditorOnMiddleclick(event) {
  if (event.button != 1) {
    return;
  }
  // open an editor on middleclick
  if (event.target.matches('.entry, .style-name, .style-edit-link')) {
    $('.style-edit-link', this).click();
    event.preventDefault();
    return;
  }
  // prevent the popup being opened in a background tab
  // when an irrelevant link was accidentally clicked
  if (event.target.closest('a')) {
    event.preventDefault();
    return;
  }
}


function openURLandHide(event) {
  event.preventDefault();
  openURL({url: event.target.href})
    .then(close);
}


function handleUpdate(style) {
  const styleElement = $(`[style-id="${style.id}"]`, installed);
  if (styleElement) {
    installed.replaceChild(createStyleElement(style), styleElement);
  } else {
    getActiveTabRealURL().then(url => {
      if (getApplicableSections(style, url).length) {
        // a new style for the current url is installed
        $('#unavailable').style.display = 'none';
        installed.appendChild(createStyleElement(style));
      }
    });
  }
}


function handleDelete(id) {
  var styleElement = $(`[style-id="${id}"]`, installed);
  if (styleElement) {
    installed.removeChild(styleElement);
  }
}
