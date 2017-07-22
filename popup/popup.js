/* global retranslateCSS */
'use strict';

let installed;
let tabURL;
const handleEvent = {};

const ENTRY_ID_PREFIX_RAW = 'style-';
const ENTRY_ID_PREFIX = '#' + ENTRY_ID_PREFIX_RAW;

getActiveTabRealURL().then(url => {
  tabURL = URLS.supported.test(url) ? url : '';
  Promise.all([
    tabURL && getStylesSafe({matchUrl: tabURL}),
    onDOMready().then(() => {
      initPopup(tabURL);
    }),
  ]).then(([styles]) => {
    showStyles(styles);
  });
});

if (FIREFOX) {
  // TODO: remove when this bug is fixed in FF
  retranslateCSS({
    '.blocked::before':
      '__MSG_stylusUnavailableForURL__',
    '.blocked #installed::before':
      '__MSG_stylusUnavailableForURLdetails__',
    '.unreachable::before':
      '__MSG_unreachableContentScript__',
    '.unreachable #installed::before':
      '__MSG_unreachableFileHint__',
  });
}

chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      // notifyAllTabs sets msg.style's code to null so we have to get the actual style
      // because we analyze its code in detectSloppyRegexps
      handleUpdate(BG.cachedStyles.byId.get(msg.style.id));
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
      } else if ('popupWidth' in msg.prefs) {
        setPopupWidth(msg.prefs.popupWidth);
      }
      break;
  }
}


function setPopupWidth(width = prefs.get('popupWidth')) {
  document.body.style.width =
    Math.max(200, Math.min(800, width)) + 'px';
}


function initPopup(url) {
  installed = $('#installed');

  setPopupWidth();

  // force Chrome to resize the popup
  if (!FIREFOX) {
    document.body.style.height = '10px';
    document.documentElement.style.height = '10px';
  }

  // action buttons
  $('#disableAll').onchange = function () {
    installed.classList.toggle('disabled', this.checked);
  };
  setupLivePrefs();

  $('#find-styles-link').onclick = handleEvent.openURLandHide;
  $('#popup-manage-button').onclick = handleEvent.openURLandHide;

  $('#popup-options-button').onclick = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  const shortcutsButton = $('#popup-shortcuts-button');
  shortcutsButton.dataset.href = URLS.configureCommands;
  shortcutsButton.onclick = handleEvent.openURLandHide;

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

  getActiveTab().then(tab => {
    chrome.tabs.sendMessage(tab.id, {method: 'ping'}, {frameId: 0}, pong => {
      if (pong === undefined) {
        document.body.classList.add('unreachable');
      }
    });
  });

  // Write new style links
  const writeStyle = $('#write-style');
  const matchTargets = document.createElement('span');
  const matchWrapper = document.createElement('span');
  matchWrapper.id = 'match';
  matchWrapper.appendChild(matchTargets);

  // For this URL
  const urlLink = template.writeStyle.cloneNode(true);
  Object.assign(urlLink, {
    href: 'edit.html?url-prefix=' + encodeURIComponent(url),
    title: `url-prefix("${url}")`,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? new URL(url).pathname.slice(1)
      : t('writeStyleForURL').replace(/ /g, '\u00a0'), // this&nbsp;URL
    onclick: handleEvent.openLink,
  });
  if (prefs.get('popup.breadcrumbs')) {
    urlLink.onmouseenter =
      urlLink.onfocus = () => urlLink.parentNode.classList.add('url()');
    urlLink.onmouseleave =
      urlLink.onblur = () => urlLink.parentNode.classList.remove('url()');
  }
  matchTargets.appendChild(urlLink);

  // For domain
  const domains = BG.getDomains(url);
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
      onclick: handleEvent.openLink,
    });
    domainLink.setAttribute('subdomain', domain.substring(0, domain.indexOf('.')));
    matchTargets.appendChild(domainLink);
  }

  if (prefs.get('popup.breadcrumbs')) {
    matchTargets.classList.add('breadcrumbs');
    matchTargets.appendChild(matchTargets.removeChild(matchTargets.firstElementChild));
  }
  writeStyle.appendChild(matchWrapper);
}


function showStyles(styles) {
  if (!styles) {
    return;
  }
  if (!styles.length) {
    installed.textContent = '';
    installed.appendChild(template.noStyles.cloneNode(true));
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


function createStyleElement({
  style,
  container = installed,
  postponeDetect,
}) {
  const entry = template.style.cloneNode(true);
  entry.setAttribute('style-id', style.id);
  Object.assign(entry, {
    id: ENTRY_ID_PREFIX_RAW + style.id,
    styleId: style.id,
    className: entry.className + ' ' + (style.enabled ? 'enabled' : 'disabled'),
    onmousedown: handleEvent.maybeEdit,
  });

  const checkbox = $('.checker', entry);
  Object.assign(checkbox, {
    id: ENTRY_ID_PREFIX_RAW + style.id,
    checked: style.enabled,
    onclick: handleEvent.toggle,
  });

  const editLink = $('.style-edit-link', entry);
  Object.assign(editLink, {
    href: editLink.getAttribute('href') + style.id,
    onclick: handleEvent.openLink,
  });

  const styleName = $('.style-name', entry);
  Object.assign(styleName, {
    htmlFor: ENTRY_ID_PREFIX_RAW + style.id,
    onclick: handleEvent.name,
  });
  styleName.checkbox = checkbox;
  styleName.appendChild(document.createTextNode(style.name));

  $('.enable', entry).onclick = handleEvent.toggle;
  $('.disable', entry).onclick = handleEvent.toggle;
  $('.delete', entry).onclick = handleEvent.delete;

  invokeOrPostpone(!postponeDetect, detectSloppyRegexps, {entry, style});

  const oldElement = $(ENTRY_ID_PREFIX + style.id);
  if (oldElement) {
    oldElement.parentNode.replaceChild(entry, oldElement);
  } else {
    container.appendChild(entry);
  }
}


Object.assign(handleEvent, {

  getClickedStyleId(event) {
    return (handleEvent.getClickedStyleElement(event) || {}).styleId;
  },

  getClickedStyleElement(event) {
    return event.target.closest('.entry');
  },

  name(event) {
    this.checkbox.click();
    event.preventDefault();
  },

  toggle(event) {
    saveStyleSafe({
      id: handleEvent.getClickedStyleId(event),
      enabled: this.type === 'checkbox' ? this.checked : this.matches('.enable'),
    });
  },

  delete(event) {
    const id = handleEvent.getClickedStyleId(event);
    const box = $('#confirm');
    box.dataset.display = true;
    box.style.cssText = '';
    $('b', box).textContent = (BG.cachedStyles.byId.get(id) || {}).name;
    $('[data-cmd="ok"]', box).onclick = () => confirm(true);
    $('[data-cmd="cancel"]', box).onclick = () => confirm(false);
    window.onkeydown = event => {
      const keyCode = event.keyCode || event.which;
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      && (keyCode === 13 || keyCode === 27)) {
        event.preventDefault();
        confirm(keyCode === 13);
      }
    };
    function confirm(ok) {
      window.onkeydown = null;
      animateElement(box, {className: 'lights-on'})
        .then(() => (box.dataset.display = false));
      if (ok) {
        deleteStyleSafe({id}).then(() => {
          // update view with 'No styles installed for this site' message
          if (!installed.children.length) {
            showStyles([]);
          }
        });
      }
    }
  },

  indicator(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const info = template.regexpProblemExplanation.cloneNode(true);
    $$('#' + info.id).forEach(el => el.remove());
    $$('a', info).forEach(el => (el.onclick = handleEvent.openURLandHide));
    $$('button', info).forEach(el => (el.onclick = handleEvent.closeExplanation));
    entry.appendChild(info);
  },

  closeExplanation() {
    $('#regexp-explanation').remove();
  },

  openLink(event) {
    if (!prefs.get('openEditInWindow', false)) {
      handleEvent.openURLandHide.call(this, event);
      return;
    }
    event.preventDefault();
    chrome.windows.create(
      Object.assign({
        url: this.href
      }, prefs.get('windowPosition', {}))
    );
    close();
  },

  maybeEdit(event) {
    if (!(
      event.button === 0 && (event.ctrlKey || event.metaKey) ||
      event.button === 1 ||
      event.button === 2)) {
      return;
    }
    // open an editor on middleclick
    if (event.target.matches('.entry, .style-name, .style-edit-link')) {
      this.onmouseup = () => $('.style-edit-link', this).click();
      this.oncontextmenu = event => event.preventDefault();
      event.preventDefault();
      return;
    }
    // prevent the popup being opened in a background tab
    // when an irrelevant link was accidentally clicked
    if (event.target.closest('a')) {
      event.preventDefault();
      return;
    }
  },

  openURLandHide(event) {
    event.preventDefault();
    openURL({url: this.href || this.dataset.href})
      .then(window.close);
  },
});


function handleUpdate(style) {
  if ($(ENTRY_ID_PREFIX + style.id)) {
    createStyleElement({style});
    return;
  }
  // Add an entry when a new style for the current url is installed
  if (tabURL && BG.getApplicableSections({style, matchUrl: tabURL, stopOnFirst: true}).length) {
    document.body.classList.remove('blocked');
    createStyleElement({style});
  }
}


function handleDelete(id) {
  $$(ENTRY_ID_PREFIX + id).forEach(el => el.remove());
}


/*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  Additionally we'll check for invalid regexps.
*/
function detectSloppyRegexps({entry, style}) {
  // make sure all regexps are compiled
  const rxCache = BG.cachedStyles.regexps;
  for (const section of style.sections) {
    for (const regexp of section.regexps) {
      for (let pass = 1; pass <= 2; pass++) {
        const cacheKey = pass === 1 ? regexp : BG.SLOPPY_REGEXP_PREFIX + regexp;
        if (!rxCache.has(cacheKey)) {
          // according to CSS4 @document specification the entire URL must match
          const anchored = pass === 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
          const rx = tryRegExp(anchored);
          rxCache.set(cacheKey, rx || false);
        }
      }
    }
  }
  const {
    appliedSections =
      BG.getApplicableSections({style, matchUrl: tabURL}),
    wannabeSections =
      BG.getApplicableSections({style, matchUrl: tabURL, strictRegexp: false}),
  } = style;

  entry.hasInvalidRegexps = wannabeSections.some(section =>
    section.regexps.some(rx => !rxCache.has(rx)));
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
    indicator.onclick = handleEvent.indicator;
    $('.main-controls', entry).appendChild(indicator);
  }
}
