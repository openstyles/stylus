/* global
  $
  $$
  $create
  animateElement
  ABOUT_BLANK
  API
  CHROME
  CHROME_HAS_BORDER_BUG
  configDialog
  FIREFOX
  getActiveTab
  getEventKeyName
  getStyleDataMerged
  hotkeys
  initializing
  moveFocus
  msg
  onDOMready
  prefs
  setupLivePrefs
  t
  tabURL
  tryJSONparse
  URLS
*/

'use strict';

/** @type Element */
let installed;
const handleEvent = {};

const ENTRY_ID_PREFIX_RAW = 'style-';
const MODAL_SHOWN = 'data-display'; // attribute name

$.entry = styleOrId => $(`#${ENTRY_ID_PREFIX_RAW}${styleOrId.id || styleOrId}`);

if (CHROME >= 66 && CHROME <= 69) { // Chrome 66-69 adds a gap, https://crbug.com/821143
  document.head.appendChild($create('style', 'html { overflow: overlay }'));
}

toggleSideBorders();

Promise.all([
  initializing,
  onDOMready(),
]).then(([
  {frames, styles},
]) => {
  toggleUiSliders();
  initPopup(frames);
  if (styles[0]) {
    showStyles(styles);
  } else {
    // unsupported URL;
    $('#popup-manage-button').removeAttribute('title');
  }
});

msg.onExtension(onRuntimeMessage);

prefs.subscribe(['popup.stylesFirst'], (key, stylesFirst) => {
  const actions = $('body > .actions');
  const before = stylesFirst ? actions : actions.nextSibling;
  document.body.insertBefore(installed, before);
});
prefs.subscribe(['popupWidth'], (key, value) => setPopupWidth(value));

if (CHROME_HAS_BORDER_BUG) {
  prefs.subscribe(['popup.borders'], (key, value) => toggleSideBorders(value));
}

function onRuntimeMessage(msg) {
  if (!tabURL) return;
  let ready = Promise.resolve();
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      if (msg.reason === 'editPreview' || msg.reason === 'editPreviewEnd') return;
      ready = handleUpdate(msg);
      break;
    case 'styleDeleted':
      handleDelete(msg.style.id);
      break;
  }
  ready.then(() => dispatchEvent(new CustomEvent(msg.method, {detail: msg})));
}


function setPopupWidth(width = prefs.get('popupWidth')) {
  document.body.style.width =
    Math.max(200, Math.min(800, width)) + 'px';
}


function toggleSideBorders(state = prefs.get('popup.borders')) {
  // runs before <body> is parsed
  const style = document.documentElement.style;
  if (CHROME_HAS_BORDER_BUG && state) {
    style.cssText +=
      'border-left: 2px solid white !important;' +
      'border-right: 2px solid white !important;';
  } else if (style.cssText) {
    style.borderLeft = style.borderRight = '';
  }
}

function toggleUiSliders() {
  const sliders = prefs.get('ui.sliders');
  const slot = $('toggle', t.template.style);
  const toggle = t.template[sliders ? 'toggleSlider' : 'toggleChecker'];
  slot.parentElement.replaceChild(toggle.cloneNode(true), slot);
  document.body.classList.toggle('has-sliders', sliders);
}

/** @param {chrome.webNavigation.GetAllFrameResultDetails[]} frames */
async function initPopup(frames) {
  installed = $('#installed');

  setPopupWidth();

  // action buttons
  $('#disableAll').onchange = function () {
    installed.classList.toggle('disabled', this.checked);
  };
  setupLivePrefs();

  Object.assign($('#popup-manage-button'), {
    onclick: handleEvent.openManager,
    oncontextmenu: handleEvent.openManager,
  });

  $('#popup-options-button').onclick = () => {
    API.openManage({options: true});
    window.close();
  };

  $('#popup-wiki-button').onclick = handleEvent.openURLandHide;

  $('#confirm').onclick = function (e) {
    const {id} = this.dataset;
    switch (e.target.dataset.cmd) {
      case 'ok':
        hideModal(this, {animate: true});
        API.deleteStyle(Number(id));
        break;
      case 'cancel':
        showModal($('.menu', $.entry(id)), '.menu-close');
        break;
    }
  };

  if (!prefs.get('popup.stylesFirst')) {
    document.body.insertBefore(
      $('body > .actions'),
      installed);
  }

  for (const el of $$('link[media=print]')) {
    el.removeAttribute('media');
  }

  if (!tabURL) {
    blockPopup();
    return;
  }

  frames.forEach(createWriterElement);
  if (frames.length > 1) {
    const el = $('#write-for-frames');
    el.hidden = false;
    el.onclick = () => el.classList.toggle('expanded');
  }

  const isStore = tabURL.startsWith(URLS.browserWebStore);
  if (isStore && !FIREFOX) {
    blockPopup();
    return;
  }

  for (let retryCountdown = 10; retryCountdown-- > 0;) {
    const tab = await getActiveTab();
    if (await msg.sendTab(tab.id, {method: 'ping'}, {frameId: 0}).catch(() => {})) {
      return;
    }
    if (tab.status === 'complete' && (!FIREFOX || tab.url !== ABOUT_BLANK)) {
      break;
    }
    // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
    // so we'll wait a bit to handle popup being invoked right after switching
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  initUnreachable(isStore);
}

function initUnreachable(isStore) {
  const info = t.template.unreachableInfo;
  if (!FIREFOX) {
    // Chrome "Allow access to file URLs" in chrome://extensions message
    info.appendChild($create('p', t('unreachableFileHint')));
  } else if (isStore) {
    $('label', info).textContent = t('unreachableAMO');
    const note = (FIREFOX < 59 ? t('unreachableAMOHintOldFF') : t('unreachableAMOHint')) +
                 (FIREFOX < 60 ? '' : '\n' + t('unreachableAMOHintNewFF'));
    const renderToken = s => s[0] === '<'
      ? $create('a', {
        textContent: s.slice(1, -1),
        onclick: handleEvent.copyContent,
        href: '#',
        className: 'copy',
        tabIndex: 0,
        title: t('copy'),
      })
      : s;
    const renderLine = line => $create('p', line.split(/(<.*?>)/).map(renderToken));
    const noteNode = $create('fragment', note.split('\n').map(renderLine));
    info.appendChild(noteNode);
  }
  // Inaccessible locally hosted file type, e.g. JSON, PDF, etc.
  if (tabURL.length - tabURL.lastIndexOf('.') <= 5) {
    info.appendChild($create('p', t('InaccessibleFileHint')));
  }
  document.body.classList.add('unreachable');
  document.body.insertBefore(info, document.body.firstChild);
}

/** @param {chrome.webNavigation.GetAllFrameResultDetails} frame */
function createWriterElement(frame) {
  const {url, frameId, parentFrameId, isDupe} = frame;
  const targets = $create('span');

  // For this URL
  const urlLink = t.template.writeStyle.cloneNode(true);
  const isAboutBlank = url === ABOUT_BLANK;
  Object.assign(urlLink, {
    href: 'edit.html?url-prefix=' + encodeURIComponent(url),
    title: `url-prefix("${url}")`,
    tabIndex: isAboutBlank ? -1 : 0,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? new URL(url).pathname.slice(1)
      : frameId
        ? isAboutBlank ? url : 'URL'
        : t('writeStyleForURL').replace(/ /g, '\u00a0'), // this&nbsp;URL
    onclick: e => handleEvent.openEditor(e, {'url-prefix': url}),
  });
  if (prefs.get('popup.breadcrumbs')) {
    urlLink.onmouseenter =
      urlLink.onfocus = () => urlLink.parentNode.classList.add('url()');
    urlLink.onmouseleave =
      urlLink.onblur = () => urlLink.parentNode.classList.remove('url()');
  }
  targets.appendChild(urlLink);

  // For domain
  const domains = getDomains(url);
  for (const domain of domains) {
    const numParts = domain.length - domain.replace(/\./g, '').length + 1;
    // Don't include TLD
    if (domains.length > 1 && numParts === 1) {
      continue;
    }
    const domainLink = t.template.writeStyle.cloneNode(true);
    Object.assign(domainLink, {
      href: 'edit.html?domain=' + encodeURIComponent(domain),
      textContent: numParts > 2 ? domain.split('.')[0] : domain,
      title: `domain("${domain}")`,
      onclick: e => handleEvent.openEditor(e, {domain}),
    });
    domainLink.setAttribute('subdomain', numParts > 1 ? 'true' : '');
    targets.appendChild(domainLink);
  }

  if (prefs.get('popup.breadcrumbs')) {
    targets.classList.add('breadcrumbs');
    targets.appendChild(urlLink); // making it the last element
  }

  const root = $('#write-style');
  const parent = $(`[data-frame-id="${parentFrameId}"]`, root) || root;
  const child = $create({
    tag: 'span',
    className: `match${isDupe ? ' dupe' : ''}${isAboutBlank ? ' about-blank' : ''}`,
    dataset: {frameId},
    appendChild: targets,
  });
  parent.appendChild(child);
  parent.dataset.children = (Number(parent.dataset.children) || 0) + 1;
}

function getDomains(url) {
  let d = url.split(/[/:]+/, 2)[1];
  if (!d || url.startsWith('file:')) {
    return [];
  }
  const domains = [d];
  while (d.includes('.')) {
    d = d.substring(d.indexOf('.') + 1);
    domains.push(d);
  }
  return domains;
}

function sortStyles(entries) {
  const enabledFirst = prefs.get('popup.enabledFirst');
  return entries.sort(({styleMeta: a}, {styleMeta: b}) =>
    Boolean(a.frameUrl) - Boolean(b.frameUrl) ||
    enabledFirst && Boolean(b.enabled) - Boolean(a.enabled) ||
    (a.customName || a.name).localeCompare(b.customName || b.name));
}

function showStyles(frameResults) {
  const entries = new Map();
  frameResults.forEach(({styles = [], url}, index) => {
    styles.forEach(style => {
      const {id} = style;
      if (!entries.has(id)) {
        style.frameUrl = index === 0 ? '' : url;
        entries.set(id, createStyleElement(style));
      }
    });
  });
  if (entries.size) {
    resortEntries([...entries.values()]);
  } else {
    installed.appendChild(t.template.noStyles);
  }
  window.dispatchEvent(new Event('showStyles:done'));
}

function resortEntries(entries) {
  // `entries` is specified only at startup, after that we respect the prefs
  if (entries || prefs.get('popup.autoResort')) {
    installed.append(...sortStyles(entries || $$('.entry', installed)));
  }
}

function createStyleElement(style) {
  let entry = $.entry(style);
  if (!entry) {
    entry = t.template.style.cloneNode(true);
    Object.assign(entry, {
      id: ENTRY_ID_PREFIX_RAW + style.id,
      styleId: style.id,
      styleIsUsercss: Boolean(style.usercssData),
      onmousedown: handleEvent.maybeEdit,
      styleMeta: style,
    });
    Object.assign($('input', entry), {
      onclick: handleEvent.toggle,
    });
    const editLink = $('.style-edit-link', entry);
    Object.assign(editLink, {
      href: editLink.getAttribute('href') + style.id,
      onclick: e => handleEvent.openEditor(e, {id: style.id}),
    });
    const styleName = $('.style-name', entry);
    Object.assign(styleName, {
      htmlFor: ENTRY_ID_PREFIX_RAW + style.id,
      onclick: handleEvent.name,
    });
    styleName.appendChild(document.createTextNode(' '));

    const config = $('.configure', entry);
    config.onclick = handleEvent.configure;
    if (!style.usercssData) {
      if (style.updateUrl && style.updateUrl.includes('?') && style.url) {
        config.href = style.url;
        config.target = '_blank';
        config.title = t('configureStyleOnHomepage');
        config.dataset.sendMessage = JSON.stringify({method: 'openSettings'});
        $('use', config).attributes['xlink:href'].nodeValue = '#svg-icon-config-uso';
      } else {
        config.classList.add('hidden');
      }
    } else if (Object.keys(style.usercssData.vars || {}).length === 0) {
      config.classList.add('hidden');
    }

    $('.delete', entry).onclick = handleEvent.delete;

    const indicator = t.template.regexpProblemIndicator.cloneNode(true);
    indicator.appendChild(document.createTextNode('!'));
    indicator.onclick = handleEvent.indicator;
    $('.main-controls', entry).appendChild(indicator);

    $('.menu-button', entry).onclick = handleEvent.toggleMenu;
    $('.menu-close', entry).onclick = handleEvent.toggleMenu;

    $('.exclude-by-domain-checkbox', entry).onchange = e => handleEvent.toggleExclude(e, 'domain');
    $('.exclude-by-url-checkbox', entry).onchange = e => handleEvent.toggleExclude(e, 'url');
  }

  style = Object.assign(entry.styleMeta, style);

  entry.classList.toggle('disabled', !style.enabled);
  entry.classList.toggle('enabled', style.enabled);
  $('input', entry).checked = style.enabled;

  const styleName = $('.style-name', entry);
  styleName.lastChild.textContent = style.customName || style.name;
  setTimeout(() => {
    styleName.title = entry.styleMeta.sloppy ?
      t('styleNotAppliedRegexpProblemTooltip') :
        styleName.scrollWidth > styleName.clientWidth + 1 ?
          styleName.textContent : '';
  });

  entry.classList.toggle('not-applied', style.excluded || style.sloppy);
  entry.classList.toggle('regexp-partial', style.sloppy);

  $('.exclude-by-domain-checkbox', entry).checked = styleExcluded(style, 'domain');
  $('.exclude-by-url-checkbox', entry).checked = styleExcluded(style, 'url');

  $('.exclude-by-domain', entry).title = getExcludeRule('domain');
  $('.exclude-by-url', entry).title = getExcludeRule('url');

  const {frameUrl} = style;
  if (frameUrl) {
    const sel = 'span.frame-url';
    const frameEl = $(sel, entry) || styleName.insertBefore($create(sel), styleName.lastChild);
    frameEl.title = frameUrl;
    frameEl.onmousedown = handleEvent.maybeEdit;
  }
  entry.classList.toggle('frame', Boolean(frameUrl));

  return entry;
}

function styleExcluded({exclusions}, type) {
  if (!exclusions) {
    return false;
  }
  const rule = getExcludeRule(type);
  return exclusions.includes(rule);
}

function getExcludeRule(type) {
  const u = new URL(tabURL);
  if (type === 'domain') {
    return u.origin + '/*';
  }
  // current page
  return escapeGlob(u.origin + u.pathname);
}

function escapeGlob(text) {
  return text.replace(/\*/g, '\\*');
}

Object.assign(handleEvent, {

  getClickedStyleId(event) {
    return (handleEvent.getClickedStyleElement(event) || {}).styleId;
  },

  getClickedStyleElement(event) {
    return event.target.closest('.entry');
  },

  name(event) {
    $('input', this).dispatchEvent(new MouseEvent('click'));
    event.preventDefault();
  },

  toggle(event) {
    // when fired on checkbox, prevent the parent label from seeing the event, see #501
    event.stopPropagation();
    API
      .toggleStyle(handleEvent.getClickedStyleId(event), this.checked)
      .then(() => resortEntries());
  },

  toggleExclude(event, type) {
    const entry = handleEvent.getClickedStyleElement(event);
    if (event.target.checked) {
      API.addExclusion(entry.styleMeta.id, getExcludeRule(type));
    } else {
      API.removeExclusion(entry.styleMeta.id, getExcludeRule(type));
    }
  },

  toggleMenu(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const menu = $('.menu', entry);
    if (menu.hasAttribute(MODAL_SHOWN)) {
      hideModal(menu, {animate: true});
    } else {
      $('.menu-title', entry).textContent = $('.style-name', entry).textContent;
      showModal(menu, '.menu-close');
    }
  },

  delete(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const box = $('#confirm');
    box.dataset.id = entry.styleId;
    $('b', box).textContent = $('.style-name', entry).textContent;
    showModal(box, '[data-cmd=cancel]');
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
    const info = t.template.regexpProblemExplanation.cloneNode(true);
    $.remove('#' + info.id);
    $$('a', info).forEach(el => (el.onclick = handleEvent.openURLandHide));
    $$('button', info).forEach(el => (el.onclick = handleEvent.closeExplanation));
    entry.appendChild(info);
  },

  closeExplanation() {
    $('#regexp-explanation').remove();
  },

  openEditor(event, options) {
    event.preventDefault();
    API.openEditor(options);
    window.close();
  },

  maybeEdit(event) {
    if (!(
      event.button === 0 && (event.ctrlKey || event.metaKey) ||
      event.button === 1 ||
      event.button === 2)) {
      return;
    }
    // open an editor on middleclick
    const el = event.target;
    if (el.matches('.entry, .style-edit-link') || el.closest('.style-name')) {
      this.onmouseup = () => $('.style-edit-link', this).click();
      this.oncontextmenu = event => event.preventDefault();
      event.preventDefault();
      return;
    }
    // prevent the popup being opened in a background tab
    // when an irrelevant link was accidentally clicked
    if (el.closest('a')) {
      event.preventDefault();
      return;
    }
  },

  openURLandHide(event) {
    event.preventDefault();
    getActiveTab()
      .then(activeTab => API.openURL({
        url: this.href || this.dataset.href,
        index: activeTab.index + 1,
        message: tryJSONparse(this.dataset.sendMessage),
      }))
      .then(window.close);
  },

  openManager(event) {
    event.preventDefault();
    const isSearch = tabURL && (event.shiftKey || event.button === 2);
    API.openManage(isSearch ? {search: tabURL, searchMode: 'url'} : {});
    window.close();
  },

  copyContent(event) {
    event.preventDefault();
    const target = document.activeElement;
    const message = $('.copy-message');
    navigator.clipboard.writeText(target.textContent);
    target.classList.add('copied');
    message.classList.add('show-message');
    setTimeout(() => {
      target.classList.remove('copied');
      message.classList.remove('show-message');
    }, 1000);
  },
});


async function handleUpdate({style, reason}) {
  if (reason !== 'toggle' || !$.entry(style)) {
    style = await getStyleDataMerged(tabURL, style.id);
    if (!style) return;
  }
  const el = createStyleElement(style);
  if (!el.parentNode) {
    installed.appendChild(el);
    blockPopup(false);
  }
  resortEntries();
}


function handleDelete(id) {
  const el = $.entry(id);
  if (el) {
    el.remove();
    if (!$('.entry')) installed.appendChild(t.template.noStyles);
  }
}

function blockPopup(isBlocked = true) {
  document.body.classList.toggle('blocked', isBlocked);
  if (isBlocked) {
    document.body.prepend(t.template.unavailableInfo);
  } else {
    t.template.unavailableInfo.remove();
    t.template.noStyles.remove();
  }
}

function showModal(box, cancelButtonSelector) {
  const oldBox = $(`[${MODAL_SHOWN}]`);
  if (oldBox) box.style.animationName = 'none';
  // '' would be fine but 'true' is backward-compatible with the existing userstyles
  box.setAttribute(MODAL_SHOWN, 'true');
  box._onkeydown = e => {
    const key = getEventKeyName(e);
    switch (key) {
      case 'Tab':
      case 'Shift-Tab':
        e.preventDefault();
        moveFocus(box, e.shiftKey ? -1 : 1);
        break;
      case 'Escape': {
        e.preventDefault();
        window.onkeydown = null;
        $(cancelButtonSelector, box).click();
        break;
      }
    }
  };
  window.on('keydown', box._onkeydown);
  moveFocus(box, 0);
  hideModal(oldBox);
}

async function hideModal(box, {animate} = {}) {
  window.off('keydown', box._onkeydown);
  box._onkeydown = null;
  if (animate) {
    box.style.animationName = '';
    await animateElement(box, 'lights-on');
  }
  box.removeAttribute(MODAL_SHOWN);
}
