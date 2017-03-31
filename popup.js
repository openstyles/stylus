/* global SLOPPY_REGEXP_PREFIX, compileStyleRegExps */
'use strict';

let installed;
let tabURL;

getActiveTabRealURL().then(url => {
  tabURL = RX_SUPPORTED_URLS.test(url) ? url : '';
  Promise.all([
    tabURL && getStylesSafe({matchUrl: tabURL}),
    onDOMready().then(() => {
      initPopup(tabURL);
    }),
  ]).then(([styles]) => {
    showStyles(styles);
  });
});


chrome.runtime.onMessage.addListener(msg => {
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      handleUpdate(msg.style);
      break;
    case 'styleDeleted':
      handleDelete(msg.id);
      break;
    case 'prefChanged':
      if ('popup.stylesFirst' in msg.prefs) {
        const stylesFirst = msg.prefs['popup.stylesFirst'];
        const actions = $('body > .actions');
        const before = stylesFirst ? actions : actions.nextSibling;
        document.body.insertBefore(installed, before);
      }
      break;
  }
});


function initPopup(url) {
  installed = $('#installed');

  // popup width
  document.body.style.width =
    Math.max(200, Math.min(800, prefs.get('popupWidth'))) + 'px';

  // force Chrome to resize the popup
  document.body.style.height = '10px';
  document.documentElement.style.height = '10px';

  // action buttons
  $('#disableAll').onchange = () =>
    installed.classList.toggle('disabled', prefs.get('disableAll'));
  setupLivePrefs(['disableAll']);
  $('#find-styles-link').onclick = openURLandHide;
  $('#popup-manage-button').href = 'manage.html';
  $('#popup-manage-button').onclick = openURLandHide;
  $('#popup-options-button').onclick = () => chrome.runtime.openOptionsPage();
  $('#popup-shortcuts-button').onclick = configureCommands.open;

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
  for (const domain of domains) {
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
  if (!styles) {
    return;
  }
  if (!styles.length) {
    installed.innerHTML = template.noStyles.outerHTML;
    return;
  }

  const enabledFirst = prefs.get('popup.enabledFirst');
  styles.sort((a, b) => (
    enabledFirst && a.enabled !== b.enabled
      ? !(a.enabled < b.enabled) ? -1 : 1
      : a.name.localeCompare(b.name)
  ));

  let postponeDetect = false;
  const t0 = performance.now();
  const container = document.createDocumentFragment();
  for (const style of styles) {
    createStyleElement({style, container, postponeDetect});
    postponeDetect = postponeDetect || performance.now() - t0 > 100;
  }
  installed.appendChild(container);

  getStylesSafe({matchUrl: tabURL, strictRegexp: false})
    .then(unscreenedStyles => {
      for (const unscreened of unscreenedStyles) {
        if (!styles.includes(unscreened)) {
          postponeDetect = postponeDetect || performance.now() - t0 > 100;
          createStyleElement({
            style: Object.assign({appliedSections: [], postponeDetect}, unscreened),
          });
        }
      }
    });
}


// silence the inapplicable warning for async code
/* eslint no-use-before-define: [2, {"functions": false, "classes": false}] */
function createStyleElement({
  style,
  container = installed,
  postponeDetect,
}) {
  const entry = template.style.cloneNode(true);
  entry.setAttribute('style-id', style.id);
  Object.assign(entry, {
    id: 'style-' + style.id,
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

  if (postponeDetect) {
    setTimeout(detectSloppyRegexps, 0, {entry, style});
  } else {
    detectSloppyRegexps({entry, style});
  }

  const oldElement = $('#style-' + style.id);
  if (oldElement) {
    oldElement.parentNode.replaceChild(entry, oldElement);
  } else {
    container.appendChild(entry);
  }
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
    const id = getClickedStyleId(event);
    const box = $('#confirm');
    box.dataset.display = true;
    box.style.cssText = '';
    $('b', box).textContent = (cachedStyles.byId.get(id) || {}).name;
    $('[data-cmd="ok"]', box).onclick = () => confirm(true);
    $('[data-cmd="cancel"]', box).onclick = () => confirm(false);
    window.onkeydown = event => {
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      && (event.keyCode == 13 || event.keyCode == 27)) {
        event.preventDefault();
        confirm(event.keyCode == 13);
      }
    };
    function confirm(ok) {
      window.onkeydown = null;
      animateElement(box, {className: 'lights-on'})
        .then(() => (box.dataset.display = false));
      if (ok) {
        deleteStyle(id).then(() => {
          // update view with 'No styles installed for this site' message
          if (!installed.children.length) {
            showStyles([]);
          }
        });
      }
    }
  }

  static indicator(event) {
    const entry = getClickedStyleElement(event);
    const info = template.regexpProblemExplanation.cloneNode(true);
    $$('#' + info.id).forEach(el => el.remove());
    $$('a', info).forEach(el => (el.onclick = openURLandHide));
    $$('button', info).forEach(el => (el.onclick = EntryOnClick.closeExplanation));
    entry.appendChild(info);
  }

  static closeExplanation(event) {
    $('#regexp-explanation').remove();
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
  openURL({url: this.href})
    .then(close);
}


function handleUpdate(style) {
  if ($('#style-' + style.id)) {
    createStyleElement({style});
    return;
  }
  // Add an entry when a new style for the current url is installed
  if (tabURL && getApplicableSections({style, matchUrl: tabURL, stopOnFirst: true}).length) {
    $('#unavailable').style.display = 'none';
    createStyleElement({style});
  }
}


function handleDelete(id) {
  $$('#style-' + id).forEach(el => el.remove());
}


/*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  Additionally we'll check for invalid regexps.
*/
function detectSloppyRegexps({entry, style}) {
  const {
    appliedSections = getApplicableSections({style, matchUrl: tabURL}),
    wannabeSections = getApplicableSections({style, matchUrl: tabURL, strictRegexp: false}),
  } = style;

  compileStyleRegExps({style, compileAll: true});
  entry.hasInvalidRegexps = wannabeSections.some(section =>
    section.regexps.some(rx => !cachedStyles.regexps.has(rx)));
  entry.sectionsSkipped = wannabeSections.length - appliedSections.length;

  if (!appliedSections.length) {
    entry.classList.add('not-applied');
    $('.style-name', entry).title = t('styleNotAppliedRegexpProblemTooltip');
  }
  if (entry.sectionsSkipped || entry.hasInvalidRegexps) {
    entry.classList.toggle('regexp-partial', entry.sectionsSkipped);
    entry.classList.toggle('regexp-invalid', entry.hasInvalidRegexps);
    const indicator = template.regexpProblemIndicator.cloneNode(true);
    indicator.appendChild(document.createTextNode(entry.sectionsSkipped || '!'));
    indicator.onclick = EntryOnClick.indicator;
    $('.main-controls', entry).appendChild(indicator);
  }
}
