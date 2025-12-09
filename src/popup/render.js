import '@/js/dom-init';
import {kStyleIdPrefix, kTabOvr, UCD} from '@/js/consts';
import {$create, $toggleClasses} from '@/js/dom';
import {template} from '@/js/localization';
import * as prefs from '@/js/prefs';
import {ownRoot} from '@/js/urls';
import {capitalize, clipString, stringAsRegExpStr, t} from '@/js/util';
import {MF} from '@/js/util-webext';
import {isBlocked, tabUrlSupported} from '.';
import * as Events from './events';

const EXT_NAME = `<${MF.name}>`;
const TPL_STYLE = template.style;
const xo = new IntersectionObserver(onIntersect);
/** @type {HTMLElement} */
export const installed = $id('installed');

export function showStyles(frames) {
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

function sortStyles(entries) {
  const enabledFirst = prefs.__values['popup.enabledFirst'];
  return entries.sort(({styleMeta: a}, {styleMeta: b}) =>
    Boolean(a.frameUrl) - Boolean(b.frameUrl) ||
    enabledFirst && Boolean(b.enabled) - Boolean(a.enabled) ||
    (a.customName || a.name).localeCompare(b.customName || b.name));
}

export function resortEntries(entries) {
  // `entries` is specified only at startup, after that we respect the prefs
  if (entries || prefs.__values['popup.autoResort']) {
    installed.append(...sortStyles(entries || [...installed.children]));
  }
}

/**
 * @param {chrome.webNavigation.GetAllFrameResultDetails} frame
 * @param {number} index - provided by forEach
 */
export function createWriterElement(frame, index) {
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

export function createStyleElement(style, entry) {
  const oldEntry = entry;
  if (entry) {
    style = Object.assign(entry.styleMeta, style);
  } else {
    entry = TPL_STYLE.cloneNode(true);
    Object.assign(entry, {
      id: kStyleIdPrefix + style.id,
      styleId: style.id,
      styleMeta: style,
    });
  }
  const {enabled, frameUrl, url, [UCD]: ucd} = style;
  const name = entry.$('.style-name');
  const cfg = entry.$('.configure');
  const hasVars = ucd ? ucd.vars : url && /\?[^#=]/.test(style.updateUrl);

  $toggleClasses(entry, {
    'empty': style.empty,
    'disabled': !enabled,
    'enabled': enabled,
    'force-applied': style.included || !!style[kTabOvr],
    'not-applied': style.excluded || style.sloppy || style.excludedScheme || style.incOvr
      || style[kTabOvr] === false,
    'regexp-partial': style.sloppy,
    'frame': frameUrl,
  });
  if (enabled || oldEntry)
    entry.$('input').checked = enabled;

  name.$entry = entry;
  name.lastChild.textContent = style.customName || style.name;

  if (!hasVars)
    cfg.hidden = true;
  else if (ucd)
    cfg.title = t('configureStyle');
  else {
    cfg.href = url;
    cfg.target = '_blank';
    cfg.title = t('configureStyleOnHomepage') + '\n' + url;
    cfg.$('i').className = 'i-external';
  }

  if (frameUrl) {
    const sel = 'span.frame-url';
    const frameEl = entry.$(sel) || name.insertBefore($create(sel), name.lastChild);
    frameEl.title = frameUrl;
  }

  if (oldEntry) xo.unobserve(name); // forcing recalc of the title
  xo.observe(name);
  return entry;
}

/** @param {IntersectionObserverEntry[]} results */
export function onIntersect(results) {
  for (const {target: $name, boundingClientRect: r} of results) {
    /** @type {StyleObj & MatchUrlResult} */
    const style = $name.$entry.styleMeta;
    const tabOvr = style[kTabOvr];
    $name.title = [
      $name.scrollWidth > r.width + 1 && $name.textContent,
      style.sloppy && t('styleNotAppliedRegexpProblemTooltip'),
      style.excluded && t('styleNotAppliedExcluded', t('styleSitesExclude')),
      style.excludedScheme && t(`styleNotAppliedScheme${capitalize(style.preferScheme)}`),
      style.included && t('styleForceApplied', t('styleSitesInclude')),
      tabOvr ? t('styleForceAppliedTab') :
        tabOvr === false && t('styleNotAppliedExcludedTab'),
      style.incOvr && t('styleNotAppliedOverridden', t('styleSitesInclude')),
    ].filter(Boolean).join('\n') || '';
  }
}

export function updateStateIcon(newDark, newDisabled) {
  const el = $('#disableAll-label img');
  let srcset = el.srcset;
  if (newDark != null) srcset = srcset.replace(/\/\D*/g, newDark ? '/' : '/light/');
  if (newDisabled != null) srcset = srcset.replace(/x?\./g, newDisabled ? 'x.' : '.');
  el.srcset = srcset;
}
