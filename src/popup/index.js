import '@/js/dom-init';
import {kAboutBlank, kPopup, kStyleIdPrefix, UCD} from '@/js/consts';
import {$create, $createFragment} from '@/js/dom';
import {getEventKeyName, setupLivePrefs} from '@/js/dom-util';
import {template} from '@/js/localization';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {isDark, onDarkChanged} from '@/js/themer';
import {CHROME, FIREFOX, MOBILE, OPERA} from '@/js/ua';
import {ownRoot} from '@/js/urls';
import {capitalize, clamp, clipString, sleep, stringAsRegExpStr, t} from '@/js/util';
import {CHROME_POPUP_BORDER_BUG, getActiveTab, MF} from '@/js/util-webext';
import * as Events from './events';
import './hotkeys';
import '@/css/onoffswitch.css';
import './popup.css';

export const styleFinder = {};
export let tabUrl;
export let tabUrlSupported;
let isBlocked;
let prevHeight;

/** @type Element */
const installed = $id('installed');
const WRITE_FRAME_SEL = '.match:not([data-frame-id="0"]):not(.dupe)';
const EXT_NAME = `<${MF.name}>`;
const TPL_STYLE = template.style;
const xo = new IntersectionObserver(onIntersect);

(async () => {
  const data = (__.MV3 ? prefs.clientData : await prefs.clientData)[kPopup];
  initPopup(...data);
  showStyles(...data);
  prevHeight = Math.max(innerHeight, 150);
  if (!MOBILE) window.on('resize', onWindowResize);
})();

onMessage.set(onRuntimeMessage);

updateStateIcon(isDark);
onDarkChanged.add(val => updateStateIcon(val, null));

prefs.subscribe('popup.stylesFirst', (key, stylesFirst) => {
  $rootCL.toggle('styles-first', stylesFirst);
  $rootCL.toggle('styles-last', !stylesFirst);
}, true);
prefs.subscribe('disableAll', (key, val) => {
  updateStateIcon(null, val);
  $id('disableAll-label').title = t('masterSwitch') + ':\n' +
    t(val ? 'disableAllStylesOff' : 'genericEnabledLabel');
}, true);
if (!__.MV3 && __.BUILD !== 'firefox' && CHROME_POPUP_BORDER_BUG) {
  prefs.subscribe('popup.borders', toggleSideBorders, true);
}
if (!__.MV3 && CHROME >= 66 && CHROME <= 69) {
  // Chrome 66-69 adds a gap, https://crbug.com/821143
  $root.style.overflow = 'overlay';
}

function onRuntimeMessage(msg) {
  if (!tabUrl) return;
  let ready;
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      if (msg.reason === 'editPreview' || msg.reason === 'editPreviewEnd') return;
      ready = handleUpdate(msg);
      break;
    case 'styleDeleted':
      $id(kStyleIdPrefix + msg.style.id)?.remove();
      break;
  }
  styleFinder.on?.(msg, ready);
}

function onWindowResize() {
  const h = innerHeight;
  if (h > prevHeight
  && document.readyState !== 'loading'
  && document.body.clientHeight > h + 1/*rounding errors in CSS*/) {
    window.off('resize', onWindowResize);
    document.body.style.maxHeight = h + 'px';
  }
  prevHeight = h;
}

function toggleSideBorders(_key, state) {
  const style = $root.style;
  if (state) {
    style.cssText += 'left right'.replace(/\S+/g, 'border-$&: 2px solid white !important;');
  } else if (style.borderLeft) {
    style.borderLeft = style.borderRight = '';
  }
}

async function initPopup(frames, ping0, tab, urlSupported) {
  const kPopupWidth = 'popupWidth';
  prefs.subscribe([kPopupWidth, 'popupWidthMax'], (key, val) => {
    document.body.style[`${key === kPopupWidth ? 'min' : 'max'}-width`] = MOBILE ? 'none'
      : clamp(val, 200, 800) + 'px';
  }, true);
  setupLivePrefs();

  const elFind = $id('find-styles-btn');
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

  Object.assign($id('popup-manage-button'), {
    onclick: Events.openManager,
    oncontextmenu: Events.openManager,
  }).on('split-btn', Events.openManager);

  $id('options-btn').onclick = () => {
    API.openManager({options: true});
    window.close();
  };

  for (const el of $$('link[media=print]')) {
    el.removeAttribute('media');
  }

  tabUrl = frames[0].url;
  tabUrlSupported = urlSupported;
  frames.forEach(createWriterElement);

  if ($('.match .match:not(.dupe),' + WRITE_FRAME_SEL)) {
    $id('write-style').append(Object.assign(template.writeForFrames, {
      onclick() {
        this.remove();
        $id('write-style').classList.add('expanded');
      },
    }));
  }

  if (ping0) return;

  const isStore = FIREFOX ? tabUrl.startsWith('https://addons.mozilla.org/') :
      OPERA ? tabUrl.startsWith('https://addons.opera.com/') :
        tabUrl.startsWith('https://chrome.google.com/webstore/') ||
        tabUrl.startsWith('https://chromewebstore.google.com/');
  blockPopup();
  if (CHROME && isStore || !urlSupported) {
    return;
  }

  for (let t2 = performance.now() + 1000; performance.now() < t2;) {
    if (await API.pingTab(tab.id)) {
      blockPopup(false);
      return;
    }
    if (tab.status === 'complete' && (CHROME || tab.url !== kAboutBlank)) {
      break;
    }
    // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
    // so we'll wait a bit to handle popup being invoked right after switching
    await sleep();
    tab = await getActiveTab();
  }

  const info = template.unreachableInfo;
  if (CHROME) {
    // Chrome "Allow access to file URLs" in chrome://extensions message
    info.appendChild($create('p', t('unreachableFileHint')));
  } else {
    info.$('label').textContent = t('unreachableAMO');
    const note = [
      !isStore && t('unreachableCSP'),
      isStore && t(FIREFOX >= 59 ? 'unreachableAMOHint' : 'unreachableMozSiteHintOldFF'),
      FIREFOX >= 60 && t('unreachableMozSiteHint'),
    ].filter(Boolean).join('\n');
    const renderToken = s => s[0] === '<'
      ? $create('a.copy', {
        tabIndex: 0,
        title: t('copy'),
      }, [
        s.slice(1, -1),
        $create('i.i-copy'),
      ])
      : s;
    const renderLine = line => $create('p', line.split(/(<.*?>)/).map(renderToken));
    const noteNode = $createFragment(note.split('\n').map(renderLine));
    info.appendChild(noteNode);
  }
  // Inaccessible locally hosted file type, e.g. JSON, PDF, etc.
  if (tabUrl.length - tabUrl.lastIndexOf('.') <= 5) {
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
  const {frameId, parentFrameId, isDupe} = frame;
  const url = tabUrlSupported || frameId
    ? frame.url.split('#')[0]
    : 'https://www.example.com/abcd';
  const isAbout = url.startsWith('about:');
  const crumbs = [];
  if (!url) return;
  let el;
  if (isAbout) {
    el = $tag('span');
    el.textContent = url;
  } else {
    el = (url.startsWith(ownRoot) ? makeExtCrumbs : makeWebCrumbs)(crumbs, url);
    el.onmouseenter = el.onmouseleave = el.onfocus = el.onblur = Events.toggleUrlLink;
    if (!index) {
      Object.assign($id('write-style-for'), {onclick: el.click.bind(el), title: el.title});
    }
  }
  crumbs.push(el);
  const root = $id('write-style');
  const parent = root.$(`[data-frame-id="${parentFrameId}"]`) || root;
  const child = $create(`.match${isDupe ? '.dupe' : ''}${isAbout ? '.about-blank' : ''}`,
    $create('.breadcrumbs', crumbs));
  child.dataset.frameId = frameId;
  parent.appendChild(child);
  parent.dataset.children = (Number(parent.dataset.children) || 0) + 1;
}

function makeExtCrumbs(crumbs, url) {
  const key = 'regexp';
  const all = '^\\w+-extension://';
  const page = url.slice(ownRoot.length, url.indexOf('.html'));
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
  return $create('a.write-style-link' + (isDomain ? '[subdomain]' : ''), {
    href: 'edit.html?' + new URLSearchParams(sp),
    onclick: Events.openEditor,
    title: `${key}("${val}")`,
  }, body);
}

function sortStyles(entries) {
  const enabledFirst = prefs.__values['popup.enabledFirst'];
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
  if (entries || prefs.__values['popup.autoResort']) {
    installed.append(...sortStyles(entries || [...installed.children]));
  }
}

function createStyleElement(style, entry) {
  if (entry) {
    style = Object.assign(entry.styleMeta, style);
  } else {
    entry = TPL_STYLE.cloneNode(true);
    Object.assign(entry, {
      id: kStyleIdPrefix + style.id,
      styleId: style.id,
      styleMeta: style,
      onmousedown: Events.maybeEdit,
    });
  }
  const {enabled, frameUrl, [UCD]: ucd} = style;
  const name = entry.$('.style-name');
  const cfg = entry.$('.configure');
  const cfgUrl = ucd ? '' : style.url;
  const cls = entry.classList;

  cls.toggle('empty', style.empty);
  cls.toggle('disabled', !enabled);
  cls.toggle('enabled', enabled);
  cls.toggle('force-applied', style.included);
  cls.toggle('not-applied', style.excluded || style.sloppy || style.excludedScheme);
  cls.toggle('regexp-partial', style.sloppy);
  cls.toggle('frame', !!frameUrl);

  entry.$('input').checked = enabled;

  name.$entry = entry;
  name.lastChild.textContent = style.customName || style.name;

  cfg.hidden = ucd ? !ucd.vars : !style.url || !`${style.updateUrl}`.includes('?');
  if (!cfg.hidden && cfg.href !== cfgUrl) {
    const el = template[ucd ? 'config' : 'configExternal'].cloneNode(true);
    if (cfgUrl) el.href = cfgUrl;
    else el.removeAttribute('href');
    cfg.replaceWith(el);
  }

  if (frameUrl) {
    const sel = 'span.frame-url';
    const frameEl = entry.$(sel) || name.insertBefore($create(sel), name.lastChild);
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
  const entry = $id(kStyleIdPrefix + style.id);
  if (reason !== 'toggle' || !entry) {
    [style] = await API.styles.getByUrl(tabUrl, style.id);
    if (!style) return;
    style = Object.assign(style.style, style);
  }
  const el = createStyleElement(style, entry);
  if (!el.isConnected) installed.append(el);
  resortEntries();
}

function blockPopup(val = true) {
  isBlocked = val;
  $rootCL.toggle('blocked', isBlocked);
}

function updateStateIcon(newDark, newDisabled) {
  const el = $('#disableAll-label img');
  let srcset = el.srcset;
  if (newDark != null) srcset = srcset.replace(/\/\D*/g, newDark ? '/' : '/light/');
  if (newDisabled != null) srcset = srcset.replace(/x?\./g, newDisabled ? 'x.' : '.');
  el.srcset = srcset;
}
