/* global configDialog hotkeys onTabReady msg
  getActiveTab FIREFOX getTabRealURL URLS API onDOMready $ $$ prefs CHROME
  setupLivePrefs template t $create tWordBreak animateElement
  tryJSONparse debounce */

'use strict';

let installed;
let tabURL;
const handleEvent = {};

const ENTRY_ID_PREFIX_RAW = 'style-';
const ENTRY_ID_PREFIX = '#' + ENTRY_ID_PREFIX_RAW;

toggleSideBorders();

getActiveTab()
  .then(tab =>
    FIREFOX && tab.url === 'about:blank' && tab.status === 'loading'
    ? getTabRealURLFirefox(tab)
    : getTabRealURL(tab)
  )
  .then(url => Promise.all([
    (tabURL = URLS.supported(url) ? url : '') &&
      API.getStylesByUrl(tabURL),
    onDOMready().then(initPopup),
  ]))
  .then(([results]) => {
    if (!results) {
      // unsupported URL;
      return;
    }
    showStyles(results.map(r => Object.assign(r.data, r)));
  })
  .catch(console.error);

msg.onExtension(onRuntimeMessage);

prefs.subscribe(['popup.stylesFirst'], (key, stylesFirst) => {
  const actions = $('body > .actions');
  const before = stylesFirst ? actions : actions.nextSibling;
  document.body.insertBefore(installed, before);
});
prefs.subscribe(['popupWidth'], (key, value) => setPopupWidth(value));
prefs.subscribe(['popup.borders'], (key, value) => toggleSideBorders(value));

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      if (msg.reason === 'editPreview' || msg.reason === 'editPreviewEnd') return;
      handleUpdate(msg);
      break;
    case 'styleDeleted':
      handleDelete(msg.style.id);
      break;
  }
  dispatchEvent(new CustomEvent(msg.method, {detail: msg}));
}


function setPopupWidth(width = prefs.get('popupWidth')) {
  document.body.style.width =
    Math.max(200, Math.min(800, width)) + 'px';
}


function toggleSideBorders(state = prefs.get('popup.borders')) {
  // runs before <body> is parsed
  const style = document.documentElement.style;
  if (CHROME >= 3167 && state) {
    style.cssText +=
      'border-left: 2px solid white !important;' +
      'border-right: 2px solid white !important;';
  } else if (style.cssText) {
    style.borderLeft = style.borderRight = '';
  }
}


function initPopup() {
  installed = $('#installed');

  setPopupWidth();

  // action buttons
  $('#disableAll').onchange = function () {
    installed.classList.toggle('disabled', this.checked);
  };
  setupLivePrefs();

  Object.assign($('#popup-manage-button'), {
    onclick: handleEvent.openManager,
    onmouseup: handleEvent.openManager,
    oncontextmenu: handleEvent.openManager,
  });

  $('#popup-options-button').onclick = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  $('#popup-wiki-button').onclick = handleEvent.openURLandHide;

  if (!prefs.get('popup.stylesFirst')) {
    document.body.insertBefore(
      $('body > .actions'),
      installed);
  }

  if (!tabURL) {
    document.body.classList.add('blocked');
    document.body.insertBefore(template.unavailableInfo, document.body.firstChild);
    return;
  }

  getActiveTab().then(function ping(tab, retryCountdown = 10) {
    msg.sendTab(tab.id, {method: 'ping'}, {frameId: 0})
      .catch(() => false)
      .then(pong => {
        if (pong) {
          return;
        }
        // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
        // so we'll wait a bit to handle popup being invoked right after switching
        if (retryCountdown > 0 && (
            tab.status !== 'complete' ||
            FIREFOX && tab.url === 'about:blank')) {
          setTimeout(ping, 100, tab, --retryCountdown);
          return;
        }
        const info = template.unreachableInfo;
        if (!FIREFOX) {
          // Chrome "Allow access to file URLs" in chrome://extensions message
          info.appendChild($create('p', t('unreachableFileHint')));
        }
        if (FIREFOX && tabURL.startsWith(URLS.browserWebStore)) {
          $('label', info).textContent = t('unreachableAMO');
          const note = (FIREFOX < 59 ? t('unreachableAMOHintOldFF') : t('unreachableAMOHint')) +
                       (FIREFOX < 60 ? '' : '\n' + t('unreachableAMOHintNewFF'));
          const renderToken = s => s[0] === '<' ? $create('b', tWordBreak(s.slice(1, -1))) : s;
          const renderLine = line => $create('p', line.split(/(<.*?>)/).map(renderToken));
          const noteNode = $create('fragment', note.split('\n').map(renderLine));
          info.appendChild(noteNode);
        }
        // Inaccessible locally hosted file type, e.g. JSON, PDF, etc.
        if (tabURL.length - tabURL.lastIndexOf(".") <= 5) {
          info.appendChild($create('p', t('InaccessibleFileHint')));
        }
        document.body.classList.add('unreachable');
        document.body.insertBefore(info, document.body.firstChild);
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
    href: 'edit.html?url-prefix=' + encodeURIComponent(tabURL),
    title: `url-prefix("${tabURL}")`,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? new URL(tabURL).pathname.slice(1)
      // this&nbsp;URL
      : t('writeStyleForURL').replace(/ /g, '\u00a0'),
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
  const domains = getDomains(tabURL);
  for (const domain of domains) {
    const numParts = domain.length - domain.replace(/\./g, '').length + 1;
    // Don't include TLD
    if (domains.length > 1 && numParts === 1) {
      continue;
    }
    const domainLink = template.writeStyle.cloneNode(true);
    Object.assign(domainLink, {
      href: 'edit.html?domain=' + encodeURIComponent(domain),
      textContent: numParts > 2 ? domain.split('.')[0] : domain,
      title: `domain("${domain}")`,
      onclick: handleEvent.openLink,
    });
    domainLink.setAttribute('subdomain', numParts > 1 ? 'true' : '');
    matchTargets.appendChild(domainLink);
  }

  if (prefs.get('popup.breadcrumbs')) {
    matchTargets.classList.add('breadcrumbs');
    matchTargets.appendChild(matchTargets.removeChild(matchTargets.firstElementChild));
  }
  writeStyle.appendChild(matchWrapper);

  function getDomains(url) {
    let d = /.*?:\/*([^/:]+)|$/.exec(url)[1];
    if (!d || url.startsWith('file:')) {
      return [];
    }
    const domains = [d];
    while (d.indexOf('.') !== -1) {
      d = d.substring(d.indexOf('.') + 1);
      domains.push(d);
    }
    return domains;
  }
}


function showStyles(styles) {
  if (!styles) {
    return;
  }
  if (!styles.length) {
    installed.appendChild(template.noStyles.cloneNode(true));
    window.dispatchEvent(new Event('showStyles:done'));
    return;
  }

  const enabledFirst = prefs.get('popup.enabledFirst');
  styles.sort((a, b) => (
    enabledFirst && a.enabled !== b.enabled
      ? !(a.enabled < b.enabled) ? -1 : 1
      : a.name.localeCompare(b.name)
  ));

  const container = document.createDocumentFragment();
  styles.forEach(style => createStyleElement({style, container}));
  installed.appendChild(container);
  window.dispatchEvent(new Event('showStyles:done'));
}


function createStyleElement({
  style,
  container = installed,
}) {
  let entry = $(ENTRY_ID_PREFIX + style.id);
  if (!entry) {
    entry = template.style.cloneNode(true);
    entry.setAttribute('style-id', style.id);
    Object.assign(entry, {
      id: ENTRY_ID_PREFIX_RAW + style.id,
      styleId: style.id,
      styleIsUsercss: Boolean(style.usercssData),
      onmousedown: handleEvent.maybeEdit,
      styleMeta: style
    });
    const checkbox = $('.checker', entry);
    Object.assign(checkbox, {
      id: ENTRY_ID_PREFIX_RAW + style.id,
      // title: t('exclusionsPopupTip'),
      onclick: handleEvent.toggle,
      // oncontextmenu: handleEvent.openExcludeMenu
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
    styleName.appendChild(document.createTextNode(' '));
    const config = $('.configure', entry);
    if (!style.usercssData && style.updateUrl && style.updateUrl.includes('?') && style.url) {
      config.target = '_blank';
      config.title = t('configureStyleOnHomepage');
      config.dataset.sendMessage = JSON.stringify({method: 'openSettings'});
      $('use', config).attributes['xlink:href'].nodeValue = '#svg-icon-config-uso';
    }
    $('.enable', entry).onclick = handleEvent.toggle;
    $('.disable', entry).onclick = handleEvent.toggle;
    $('.delete', entry).onclick = handleEvent.delete;
    $('.configure', entry).onclick = handleEvent.configure;

    const indicator = template.regexpProblemIndicator.cloneNode(true);
    indicator.appendChild(document.createTextNode('!'));
    indicator.onclick = handleEvent.indicator;
    $('.main-controls', entry).appendChild(indicator);
  }

  style = Object.assign(entry.styleMeta, style);

  entry.classList.toggle('disabled', !style.enabled);
  entry.classList.toggle('enabled', style.enabled);
  $('.checker', entry).checked = style.enabled;

  const styleName = $('.style-name', entry);
  styleName.lastChild.textContent = style.name;
  setTimeout(() => {
    styleName.title = entry.styleMeta.sloppy ?
      t('styleNotAppliedRegexpProblemTooltip') :
        styleName.scrollWidth > styleName.clientWidth + 1 ?
          styleName.textContent : '';
  });

  const config = $('.configure', entry);
  if (!style.usercssData && style.updateUrl && style.updateUrl.includes('?') && style.url) {
    config.href = style.url;
  } else {
    config.removeAttribute('href');
  }
  config.style.display =
    !style.usercssData && config.href ||
    style.usercssData && Object.keys(style.usercssData.vars || {}).length ?
      '' : 'none';

  entry.classList.toggle('not-applied', style.excluded || style.sloppy);
  entry.classList.toggle('regexp-partial', style.sloppy);

  if (entry.parentNode !== container) {
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
    this.checkbox.dispatchEvent(new MouseEvent('click'));
    event.preventDefault();
  },

  toggle(event) {
    // when fired on checkbox, prevent the parent label from seeing the event, see #501
    event.stopPropagation();
    API.toggleStyle(
      handleEvent.getClickedStyleId(event),
      this.matches('.enable') || this.checked
    );
  },

  delete(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const id = entry.styleId;
    const box = $('#confirm');
    box.dataset.display = true;
    box.style.cssText = '';
    $('b', box).textContent = $('.style-name', entry).textContent;
    $('[data-cmd="ok"]', box).focus();
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
      animateElement(box, {
        className: 'lights-on',
        onComplete: () => (box.dataset.display = false),
      });
      if (ok) API.deleteStyle(id);
    }
  },

  configure(event) {
    const {styleId, styleIsUsercss} = handleEvent.getClickedStyleElement(event);
    if (styleIsUsercss) {
      API.getStyle(styleId, true).then(style => {
        hotkeys.setState(false);
        configDialog(style).then(() => {
          hotkeys.setState(true);
        });
      });
    } else {
      handleEvent.openURLandHide.call(this, event);
    }
  },

  indicator(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const info = template.regexpProblemExplanation.cloneNode(true);
    $.remove('#' + info.id);
    $$('a', info).forEach(el => (el.onclick = handleEvent.openURLandHide));
    $$('button', info).forEach(el => (el.onclick = handleEvent.closeExplanation));
    entry.appendChild(info);
  },

  closeExplanation() {
    $('#regexp-explanation').remove();
  },

  openLink(event) {
    if (!chrome.windows || !prefs.get('openEditInWindow', false)) {
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
    const message = tryJSONparse(this.dataset.sendMessage);
    getActiveTab()
      .then(activeTab => API.openURL({
        url: this.href || this.dataset.href,
        index: activeTab.index + 1
      }))
      .then(tab => {
        if (message) {
          return onTabReady(tab)
            .then(() => msg.sendTab(tab.id, message));
        }
      })
      .then(window.close);
  },

  openManager(event) {
    event.preventDefault();
    if (!this.eventHandled) {
      this.eventHandled = true;
      this.dataset.href += event.shiftKey || event.button === 2 ?
        '?url=' + encodeURIComponent(tabURL) : '';
      handleEvent.openURLandHide.call(this, event);
    }
  },
});


function handleUpdate({style, reason}) {
  if (!tabURL) return;

  fetchStyle()
    .then(style => {
      if (!style) {
        return;
      }
      if ($(ENTRY_ID_PREFIX + style.id)) {
        createStyleElement({style});
        return;
      }
      document.body.classList.remove('blocked');
      $$.remove('.blocked-info, #no-styles');
      createStyleElement({style});
    })
    .catch(console.error);

  function fetchStyle() {
    if (reason === 'toggle' && $(ENTRY_ID_PREFIX + style.id)) {
      return Promise.resolve(style);
    }
    return API.getStylesByUrl(tabURL, style.id)
      .then(([result]) => result && Object.assign(result.data, result));
  }
}


function handleDelete(id) {
  $.remove(ENTRY_ID_PREFIX + id);
  if (!$('.entry')) {
    installed.appendChild(template.noStyles.cloneNode(true));
  }
}

function getTabRealURLFirefox(tab) {
  // wait for FF tab-on-demand to get a real URL (initially about:blank), 5 sec max
  return new Promise(resolve => {
    function onNavigation({tabId, url, frameId}) {
      if (tabId === tab.id && frameId === 0) {
        detach();
        resolve(url);
      }
    }

    function detach(timedOut) {
      if (timedOut) {
        resolve(tab.url);
      } else {
        debounce.unregister(detach);
      }
      chrome.webNavigation.onBeforeNavigate.removeListener(onNavigation);
      chrome.webNavigation.onCommitted.removeListener(onNavigation);
      chrome.tabs.onRemoved.removeListener(detach);
      chrome.tabs.onReplaced.removeListener(detach);
    }

    chrome.webNavigation.onBeforeNavigate.addListener(onNavigation);
    chrome.webNavigation.onCommitted.addListener(onNavigation);
    chrome.tabs.onRemoved.addListener(detach);
    chrome.tabs.onReplaced.addListener(detach);
    debounce(detach, 5000, {timedOut: true});
  });
}
