/* global $ $$ $create getEventKeyName setupLivePrefs */// dom.js
/* global ABOUT_BLANK getStyleDataMerged preinit */// preinit.js
/* global API msg */// msg.js
/* global Events */
/* global prefs */
/* global t */// localization.js
/* global
  CHROME
  CHROME_POPUP_BORDER_BUG
  FIREFOX
  URLS
  capitalize
  clamp
  debounce
  getActiveTab
  isEmptyObj
*/// toolbox.js
'use strict';

let tabURL;
let isBlocked;

/** @type Element */
const installed = $('#installed');
const ENTRY_ID_PREFIX_RAW = 'style-';
const $entry = styleOrId => $(`#${ENTRY_ID_PREFIX_RAW}${styleOrId.id || styleOrId}`);

preinit.then(({frames, styles, url}) => {
  tabURL = url;
  initPopup(frames);
  if (styles[0]) {
    showStyles(styles);
  } else {
    // unsupported URL;
    $('#popup-manage-button').removeAttribute('title');
  }
});

msg.onExtension(onRuntimeMessage);

prefs.subscribe('popup.stylesFirst', (key, stylesFirst) => {
  $.rootCL.toggle('styles-last', !stylesFirst);
}, {runNow: true});
if (CHROME_POPUP_BORDER_BUG) {
  prefs.subscribe('popup.borders', toggleSideBorders, {runNow: true});
}
if (CHROME >= 66 && CHROME <= 69) { // Chrome 66-69 adds a gap, https://crbug.com/821143
  document.head.appendChild($create('style', 'html { overflow: overlay }'));
}
if (CHROME >= 107) {
  t.NodeList(document); // MutationObserver doesn't work with chrome://flags/#enable-prerender2
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

function setPopupWidth(_key, width) {
  document.body.style.width =
    clamp(width, 200, 800) + 'px';
}

function toggleSideBorders(_key, state) {
  // runs before <body> is parsed
  const style = $.root.style;
  if (state) {
    style.cssText +=
      'border-left: 2px solid white !important;' +
      'border-right: 2px solid white !important;';
  } else if (style.cssText) {
    style.borderLeft = style.borderRight = '';
  }
}

/** @param {chrome.webNavigation.GetAllFrameResultDetails[]} frames */
async function initPopup(frames) {
  prefs.subscribe('popupWidth', setPopupWidth, {runNow: true});
  setupLivePrefs();

  const elFind = $('#find-styles-btn');
  const elFindDeps = async () => {
    if (!t.template.searchUI) {
      document.body.append(await t.fetchTemplate('/popup/search.html', 'searchUI'));
    }
    await require([
      '/popup/search.css',
      '/popup/search',
    ]);
  };
  elFind.on('click', async () => {
    elFind.disabled = true;
    await elFindDeps();
    Events.searchInline();
  });
  elFind.on('split-btn', async e => {
    await elFindDeps();
    Events.searchSite(e);
  });
  window.on('keydown', e => {
    if (getEventKeyName(e) === 'Ctrl-F') {
      e.preventDefault();
      elFind.click();
    }
  });

  Object.assign($('#popup-manage-button'), {
    onclick: Events.openManager,
    oncontextmenu: Events.openManager,
  }).on('split-btn', Events.openManager);

  $('#options-btn').onclick = () => {
    API.openManage({options: true});
    window.close();
  };

  for (const el of $$('link[media=print]')) {
    el.removeAttribute('media');
  }

  if (!tabURL) {
    blockPopup();
    return;
  }

  frames.forEach(createWriterElement);

  if (frames.length > 1 && $('.match .match:not(.dupe)')) {
    $('#write-style').append(Object.assign(t.template.writeForFrames, {
      onclick() {
        this.remove();
        $('#write-style').classList.add('expanded');
      },
    }));
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
  } else {
    $('label', info).textContent = t('unreachableAMO');
    const note = [
      !isStore && t('unreachableCSP'),
      isStore && t(FIREFOX >= 59 ? 'unreachableAMOHint' : 'unreachableMozSiteHintOldFF'),
      FIREFOX >= 60 && t('unreachableMozSiteHint'),
    ].filter(Boolean).join('\n');
    const renderToken = s => s[0] === '<'
      ? $create('a.copy', {
        textContent: s.slice(1, -1),
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

/**
 * @param {chrome.webNavigation.GetAllFrameResultDetails} frame
 * @param {number} index - provided by forEach
 */
function createWriterElement(frame, index) {
  const {url, frameId, parentFrameId, isDupe} = frame;
  const targets = $create('span');
  const elFor = !index ? $('#write-style-for') : {};
  // For this URL
  const urlLink = t.template.writeStyle.cloneNode(true);
  const isAboutBlank = url.startsWith('about:');
  Object.assign(urlLink, {
    href: 'edit.html?url-prefix=' + encodeURIComponent(url),
    title: elFor.title = `url-prefix("${url}")`,
    tabIndex: isAboutBlank ? -1 : 0,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? t.breakWord(new URL(url).pathname.slice(1))
      : frameId
        ? isAboutBlank ? url : 'URL'
        : t('writeStyleForURL').replace(/ /g, '\u00a0'), // this&nbsp;URL
    onclick: elFor.onclick = Events.openEditor,
    openEditorOpts: {'url-prefix': url},
  });
  if (prefs.get('popup.breadcrumbs')) {
    urlLink.onmouseenter = urlLink.onmouseleave =
      urlLink.onfocus = urlLink.onblur = Events.toggleUrlLink;
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
      textContent: t.breakWord(numParts > 2 ? domain.split('.')[0] : domain),
      title: `domain("${domain}")`,
      onclick: Events.openEditor,
      openEditorOpts: {domain},
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
    if (isBlocked && !index) return;
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
  const zebra = $('.entry:last-child:nth-child(odd)') &&
  !$('.styles-last') ? 'reverse-zebra' : 'zebra';
  $('#installed').classList.add(`${zebra}`);
  require(['/popup/hotkeys']);
}

function resortEntries(entries) {
  // `entries` is specified only at startup, after that we respect the prefs
  if (entries || prefs.get('popup.autoResort')) {
    installed.append(...sortStyles(entries || $$('.entry', installed)));
  }
}

function createStyleElement(style, entry) {
  if (entry) {
    style = Object.assign(entry.styleMeta, style);
  } else {
    entry = t.template.style.cloneNode(true);
    Object.assign(entry, {
      id: ENTRY_ID_PREFIX_RAW + style.id,
      styleId: style.id,
      onmousedown: Events.maybeEdit,
    });
  }
  entry.styleMeta = style;
  const cls = entry.classList;
  cls.toggle('disabled', !style.enabled);
  cls.toggle('enabled', style.enabled);
  $('input', entry).checked = style.enabled;

  const styleName = $('.style-name', entry);
  styleName.lastChild.textContent = style.customName || style.name;
  debounce(() => {
    styleName.title =
      style.sloppy ? t('styleNotAppliedRegexpProblemTooltip') :
      style.excludedScheme ? t(`styleNotAppliedScheme${capitalize(style.preferScheme)}`) :
      styleName.scrollWidth > styleName.clientWidth + 1 ? styleName.textContent :
      '';
  });

  const UCD = style.usercssData;
  const cfg = $('.configure', entry);
  const cfgUrl = UCD ? '#' : style.url;
  cfg.hidden = UCD ? isEmptyObj(UCD.vars) : !style.url || !`${style.updateUrl}`.includes('?');
  if (!cfg.hidden && cfg.href !== cfgUrl) {
    const el = t.template[UCD ? 'config' : 'configExternal'].cloneNode(true);
    el.href = cfgUrl;
    cfg.replaceWith(el);
  }

  cls.toggle('force-applied', style.included);
  cls.toggle('not-applied', style.excluded || style.sloppy || style.excludedScheme);
  cls.toggle('regexp-partial', style.sloppy);

  const {frameUrl} = style;
  if (frameUrl) {
    const sel = 'span.frame-url';
    const frameEl = $(sel, entry) || styleName.insertBefore($create(sel), styleName.lastChild);
    frameEl.title = frameUrl;
    frameEl.onmousedown = Events.maybeEdit;
  }
  cls.toggle('frame', Boolean(frameUrl));

  return entry;
}

async function handleUpdate({style, reason}) {
  const entry = $entry(style);
  if (reason !== 'toggle' || !entry) {
    style = await getStyleDataMerged(tabURL, style.id);
    if (!style) return;
  }
  const el = createStyleElement(style, entry);
  if (!el.parentNode) {
    installed.appendChild(el);
    blockPopup(false);
  }
  resortEntries();
}

function handleDelete(id) {
  const el = $entry(id);
  if (el) {
    el.remove();
    if (!$('.entry')) installed.appendChild(t.template.noStyles);
  }
}

function blockPopup(val = true) {
  isBlocked = val;
  document.body.classList.toggle('blocked', isBlocked);
  if (isBlocked) {
    document.body.prepend(t.template.unavailableInfo);
  } else {
    t.template.unavailableInfo.remove();
    t.template.noStyles.remove();
  }
}
