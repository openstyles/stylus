import '@/js/dom-init';
import {kStyleIdPrefix, UCD} from '@/js/consts';
import {$create} from '@/js/dom';
import {template} from '@/js/localization';
import {ownRoot} from '@/js/urls';
import {capitalize, clipString, stringAsRegExpStr, t} from '@/js/util';
import {MF} from '@/js/util-webext';
import {tabUrlSupported} from '.';
import * as Events from './events';

const EXT_NAME = `<${MF.name}>`;
const TPL_STYLE = template.style;
const xo = new IntersectionObserver(onIntersect);

export function toggleSideBorders(_key, state) {
  const style = $root.style;
  if (state) {
    style.cssText += 'left right'.replace(/\S+/g, 'border-$&: 2px solid white !important;');
  } else if (style.borderLeft) {
    style.borderLeft = style.borderRight = '';
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
export function onIntersect(results) {
  for (const {target: $name, boundingClientRect: r} of results) {
    const style = $name.$entry.styleMeta;
    $name.title = style.sloppy ? t('styleNotAppliedRegexpProblemTooltip') :
      style.excludedScheme ? t(`styleNotAppliedScheme${capitalize(style.preferScheme)}`) :
        $name.scrollWidth > r.width + 1 ? $name.textContent :
          '';
  }
}

export function updateStateIcon(newDark, newDisabled) {
  const el = $('#disableAll-label img');
  let srcset = el.srcset;
  if (newDark != null) srcset = srcset.replace(/\/\D*/g, newDark ? '/' : '/light/');
  if (newDisabled != null) srcset = srcset.replace(/x?\./g, newDisabled ? 'x.' : '.');
  el.srcset = srcset;
}
