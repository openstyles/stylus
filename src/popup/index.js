import {$, $$, $create, $remove, getEventKeyName, setupLivePrefs} from '/js/dom';
import {t, tBody, template} from '/js/localization';
import {API, onExtension, sendTab} from '/js/msg';
import popupGetStyles, {ABOUT_BLANK} from '/js/popup-get-styles';
import * as prefs from '/js/prefs';
import {
  capitalize, CHROME, CHROME_POPUP_BORDER_BUG, clamp, clipString, FIREFOX, getActiveTab, isEmptyObj,
  MF, MOBILE, OPERA, stringAsRegExpStr, UCD, URLS,
} from '/js/toolbox';
import * as Events from './events';
import './hotkeys';
import './popup.css';

export const styleFinder = {};
export let tabURL;
let isBlocked;

/** @type Element */
const installed = $('#installed');
const WRITE_FRAME_SEL = '.match:not([data-frame-id="0"]):not(.dupe)';
const ENTRY_ID_PREFIX_RAW = 'style-';
const EXT_NAME = `<${MF.name}>`;
const xo = new IntersectionObserver(onIntersect);
export const $entry = styleOrId => $(`#${ENTRY_ID_PREFIX_RAW}${styleOrId.id || styleOrId}`);

tBody();

(async () => {
  const data = CHROME && await API.data.pop('popupData')
    || await popupGetStyles();
  initPopup(...data);
  showStyles(...data);
  if (MOBILE) document.body.style.maxHeight = '100vh';
  else window.on('resize', onWindowResize);
})();

onExtension(onRuntimeMessage);

prefs.subscribe('popup.stylesFirst', (key, stylesFirst) => {
  $.rootCL.toggle('styles-first', stylesFirst);
  $.rootCL.toggle('styles-last', !stylesFirst);
}, true);
prefs.subscribe('newStyleAsUsercss', (key, val) => {
  $('#write-style-for').textContent = t(val ? 'optionsAdvancedNewStyleAsUsercss' : 'writeStyleFor');
}, true);
if (CHROME_POPUP_BORDER_BUG) {
  prefs.subscribe('popup.borders', toggleSideBorders, true);
}
if (CHROME >= 66 && CHROME <= 69) { // Chrome 66-69 adds a gap, https://crbug.com/821143
  document.head.appendChild($create('style', 'html { overflow: overlay }'));
}

function onRuntimeMessage(msg) {
  if (!tabURL) return;
  let ready;
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      if (msg.reason === 'editPreview' || msg.reason === 'editPreviewEnd') return;
      ready = handleUpdate(msg);
      break;
    case 'styleDeleted':
      $remove($entry(msg.style.id));
      break;
  }
  styleFinder.on?.(msg, ready);
}

function onWindowResize() {
  if (document.readyState !== 'complete') {
    requestAnimationFrame(onWindowResize);
  } else if (document.body.clientHeight > innerHeight) {
    removeEventListener('resize', onWindowResize);
    document.body.style.maxHeight = innerHeight + 'px';
  }
}

function toggleSideBorders(_key, state) {
  const style = $.root.style;
  if (state) {
    style.cssText += 'left right'.replace(/\S+/g, 'border-$&: 2px solid white !important;');
  } else if (style.borderLeft) {
    style.borderLeft = style.borderRight = '';
  }
}

async function initPopup(frames, ping0, tab) {
  const kPopupWidth = 'popupWidth';
  prefs.subscribe([kPopupWidth, 'popupWidthMax'], (key, val) => {
    document.body.style[`${key === kPopupWidth ? 'min' : 'max'}-width`] = MOBILE ? 'none'
      : clamp(val, 200, 800) + 'px';
  }, true);
  setupLivePrefs();

  const elFind = $('#find-styles-btn');
  elFind.on('click', async () => {
    elFind.disabled = true;
    if (!styleFinder.on) await import('./search');
    styleFinder.inline();
  });
  elFind.on('split-btn', async e => {
    if (!styleFinder.on) await import('./search');
    styleFinder.inSite(e);
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

  tabURL = frames[0].url;
  frames.forEach(createWriterElement);

  if ($('.match .match:not(.dupe),' + WRITE_FRAME_SEL)) {
    $('#write-style').append(Object.assign(template.writeForFrames, {
      onclick() {
        this.remove();
        $('#write-style').classList.add('expanded');
      },
    }));
  }

  if (ping0) return;

  const isStore = FIREFOX ? tabURL.startsWith('https://addons.mozilla.org/') :
      OPERA ? tabURL.startsWith('https://addons.opera.com/') :
        tabURL.startsWith('https://chrome.google.com/webstore/') ||
        tabURL.startsWith('https://chromewebstore.google.com/');
  blockPopup();
  if (CHROME && isStore || !URLS.supported(tabURL)) {
    return;
  }

  for (let t2 = performance.now() + 1000; performance.now() < t2;) {
    if (await sendTab(tab.id, {method: 'ping'}, {frameId: 0})) {
      blockPopup(false);
      return;
    }
    if (tab.status === 'complete' && (CHROME || tab.url !== ABOUT_BLANK)) {
      break;
    }
    // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
    // so we'll wait a bit to handle popup being invoked right after switching
    await new Promise(setTimeout);
    tab = await getActiveTab();
  }

  const info = template.unreachableInfo;
  if (CHROME) {
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
  const elInfo = $('.blocked-info');
  if (elInfo) elInfo.replaceWith(info);
  else document.body.prepend(info);
}

/**
 * @param {chrome.webNavigation.GetAllFrameResultDetails} frame
 * @param {number} index - provided by forEach
 */
function createWriterElement(frame, index) {
  const {url, frameId, parentFrameId, isDupe} = frame;
  const isAbout = url.startsWith('about:');
  const crumbs = [];
  let el;
  if (isAbout) {
    el = $create('span', url);
  } else {
    el = (url.startsWith(URLS.ownOrigin) ? makeExtCrumbs : makeWebCrumbs)(crumbs, url);
    el.onmouseenter = el.onmouseleave = el.onfocus = el.onblur = Events.toggleUrlLink;
    if (!index) Object.assign($('#write-style-for'), {onclick: el.click.bind(el), title: el.title});
  }
  crumbs.push(el);
  const root = $('#write-style');
  const parent = $(`[data-frame-id="${parentFrameId}"]`, root) || root;
  const child = $create(`.match${isDupe ? '.dupe' : ''}${isAbout ? '.about-blank' : ''}`, {
    'data-frame-id': frameId,
  }, $create('.breadcrumbs', crumbs));
  parent.appendChild(child);
  parent.dataset.children = (Number(parent.dataset.children) || 0) + 1;
}

function makeExtCrumbs(crumbs, url) {
  const key = 'regexp';
  const all = '^\\w+-extension://';
  const page = url.slice(URLS.ownOrigin.length, url.indexOf('.html'));
  crumbs.push(makeCrumb(key, all + '.+', EXT_NAME, EXT_NAME, true));
  return makeCrumb(key, `${all}[^/]+/${stringAsRegExpStr(page)}.*`, EXT_NAME, page + '.*');
}

function makeWebCrumbs(crumbs, url) {
  const u = new URL(url);
  const h = u.hostname; // stripping user:pwd@ and :port
  const host = h || url;
  const tail = h && (u.port ? ':' + u.port : '') + u.pathname + u.search + u.hash;
  for (let domain, d, j = 0; // show `tld` part only if it's the entire host e.g. localhost
       (domain = host.slice(j)) && ((d = domain.split('.'))[1] || !j);) {
    d = d[2] ? d[0] : domain; // kinda strip the public suffix lol
    crumbs.push(makeCrumb('domain', domain, '', d, true));
    j = host.indexOf('.', j + 1) + 1 || host.length;
  }
  return makeCrumb('url-prefix', url, '', clipString(tail) || t('writeStyleForURL'));
}

function makeCrumb(key, val, name, body, isDomain) {
  const sp = {[key]: val};
  if (name) sp.name = name;
  return $create('a.write-style-link', {
    href: 'edit.html?' + new URLSearchParams(sp),
    onclick: Events.openEditor,
    title: `${key}("${val}")`,
    attributes: isDomain && {subdomain: ''},
  }, body);
}

function sortStyles(entries) {
  const enabledFirst = prefs.get('popup.enabledFirst');
  return entries.sort(({styleMeta: a}, {styleMeta: b}) =>
    Boolean(a.frameUrl) - Boolean(b.frameUrl) ||
    enabledFirst && Boolean(b.enabled) - Boolean(a.enabled) ||
    (a.customName || a.name).localeCompare(b.customName || b.name));
}

function showStyles(frames) {
  const entries = new Map();
  for (let i = 0; i < frames.length; i++) {
    if (isBlocked && !i) continue; // skip a blocked main frame
    const frame = frames[i];
    for (let fs of frame.styles || []) {
      const id = fs.style.id;
      if (!entries.has(id)) {
        fs = Object.assign(fs.style, fs);
        fs.frameUrl = !i ? '' : frame.url;
        entries.set(id, createStyleElement(fs));
      }
    }
  }
  resortEntries([...entries.values()]);
}

export function resortEntries(entries) {
  // `entries` is specified only at startup, after that we respect the prefs
  if (entries || prefs.get('popup.autoResort')) {
    installed.append(...sortStyles(entries || [...installed.children]));
  }
}

function createStyleElement(style, entry) {
  if (entry) {
    style = Object.assign(entry.styleMeta, style);
  } else {
    entry = template.style.cloneNode(true);
    Object.assign(entry, {
      id: ENTRY_ID_PREFIX_RAW + style.id,
      styleId: style.id,
      styleMeta: style,
      onmousedown: Events.maybeEdit,
    });
  }
  const {enabled, frameUrl, [UCD]: ucd} = style;
  const name = $('.style-name', entry);
  const cfg = $('.configure', entry);
  const cfgUrl = ucd ? '' : style.url;
  const cls = entry.classList;

  cls.toggle('empty', style.empty);
  cls.toggle('disabled', !enabled);
  cls.toggle('enabled', enabled);
  cls.toggle('force-applied', style.included);
  cls.toggle('not-applied', style.excluded || style.sloppy || style.excludedScheme);
  cls.toggle('regexp-partial', style.sloppy);
  cls.toggle('frame', !!frameUrl);

  $('input', entry).checked = enabled;

  name.$entry = entry;
  name.lastChild.textContent = style.customName || style.name;

  cfg.hidden = ucd ? isEmptyObj(ucd.vars) : !style.url || !`${style.updateUrl}`.includes('?');
  if (!cfg.hidden && cfg.href !== cfgUrl) {
    const el = template[ucd ? 'config' : 'configExternal'].cloneNode(true);
    if (cfgUrl) el.href = cfgUrl;
    else el.removeAttribute('href');
    cfg.replaceWith(el);
  }

  if (frameUrl) {
    const sel = 'span.frame-url';
    const frameEl = $(sel, entry) || name.insertBefore($create(sel), name.lastChild);
    frameEl.title = frameUrl;
    frameEl.onmousedown = Events.maybeEdit;
  }

  xo.observe(name);
  return entry;
}

/** @param {IntersectionObserverEntry[]} results */
function onIntersect(results) {
  for (const {target: $name, boundingClientRect: r} of results) {
    const style = $name.$entry.styleMeta;
    $name.title = style.sloppy ? t('styleNotAppliedRegexpProblemTooltip') :
      style.excludedScheme ? t(`styleNotAppliedScheme${capitalize(style.preferScheme)}`) :
        $name.scrollWidth > r.width + 1 ? $name.textContent :
          '';
  }
}

async function handleUpdate({style, reason}) {
  const entry = $entry(style);
  if (reason !== 'toggle' || !entry) {
    [style] = await API.styles.getByUrl(tabURL, style.id);
    if (!style) return;
    style = Object.assign(style.style, style);
  }
  const el = createStyleElement(style, entry);
  if (!el.isConnected) installed.append(el);
  resortEntries();
}

function blockPopup(val = true) {
  isBlocked = val;
  $.rootCL.toggle('blocked', isBlocked);
  $('#write-wrapper').classList.toggle('hidden', !$(WRITE_FRAME_SEL));
}
