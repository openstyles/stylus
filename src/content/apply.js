import * as msg from '/js/msg-base';
import {API, apiPortDisconnect} from '/js/msg-base';
import * as styleInjector from './style-injector';

let isTab = !chrome.tabs || location.pathname !== '/popup.html';
const own = /** @type {Injection} */{
  cfg: {off: false, top: ''},
};
const calcOrder = ({id}, _) =>
  (_ = own.cfg.order) &&
  (_.prio[id] || 0) * 1e6 ||
  _.main[id] ||
  id + .5e6; // no order = at the end of `main`
const isXml = document instanceof XMLDocument;
const CHROME = 'app' in chrome;
const SYM_ID = 'styles';
const isUnstylable = !CHROME && isXml;
const clone = 0 && process.env.PAGE // TODO: ensure deepCopy is defined first
  ? deepCopy /* global deepCopy */// will be used in extension context
  : val => typeof val === 'object' && val ? JSON.parse(JSON.stringify(val)) : val;
const isFrame = window !== parent;
/** @type {number}
 * TODO: expose to msg.js without `window`
 * -1 = top prerendered, 0 = iframe, 1 = top, 2 = top reified */
let TDM = window.TDM = isFrame ? 0 : document.prerendering ? -1 : 1;
let isFrameSameOrigin = false;
if (isFrame) {
  try {
    isFrameSameOrigin = Object.getOwnPropertyDescriptor(parent.location, 'href');
    isFrameSameOrigin = !!isFrameSameOrigin?.get;
  } catch (e) {}
}
const isFrameNoUrl = isFrameSameOrigin && location.protocol === 'about:';

// dynamic iframes don't have a URL yet so we'll use their parent's URL (hash isn't inherited)
let matchUrl = isFrameNoUrl
  ? parent.location.href.split('#')[0]
  : location.href;
let isOrphaned, orphanCleanup;
let offscreen;
// firefox doesn't orphanize content scripts so the old elements stay
if (!CHROME) styleInjector.clearOrphans();

/** @type chrome.runtime.Port */
let port;
let lazyBadge = isFrame;

/** Polyfill for documentId in Firefox and Chrome pre-106 */
const instanceId = !(CHROME && CSS.supports('top', '1ic')) && (Math.random() + matchUrl);
/* about:blank iframes are often used by sites for file upload or background tasks
 * and they may break if unexpected DOM stuff is present at `load` event
 * so we'll add the styles only if the iframe becomes visible */
const xoEventId = `${Math.random()}`;
/** @type IntersectionObserver */
let xo;
window[Symbol.for('xo')] = (el, cb) => {
  if (!xo) xo = new IntersectionObserver(onIntersect, {rootMargin: '100%'});
  el.addEventListener(xoEventId, cb, {once: true});
  xo.observe(el);
};

// FIXME: move this to background page when following bugs are fixed:
// https://bugzil.la/1587723, https://crbug.com/968651
const mqDark = !isFrame && matchMedia('(prefers-color-scheme: dark)');
if (mqDark) {
  mqDark.onchange = ({matches: m}) => {
    if (m !== own.cfg.dark) API.info.set({preferDark: own.cfg.dark = m});
  };
}

// Declare all vars before init() or it'll throw due to "temporal dead zone" of const/let
styleInjector.init(onInjectorUpdate, (a, b) => calcOrder(a) - calcOrder(b));
init();

// the popup needs a check as it's not a tab but can be opened in a tab manually for whatever reason
if (!isTab) {
  chrome.tabs.getCurrent(tab => {
    isTab = Boolean(tab);
    if (tab && styleInjector.list.length) updateCount();
  });
}

msg.onTab(applyOnMessage);
addEventListener('pageshow', onBFCache);
addEventListener('pagehide', onBFCache);
if (TDM < 0) document.onprerenderingchange = onReified;

if (!chrome.tabs) {
  dispatchEvent(new CustomEvent(chrome.runtime.id, {detail: orphanCleanup = Math.random()}));
  addEventListener(chrome.runtime.id, orphanCheck, true);
}

function onInjectorUpdate() {
  if (!isOrphaned) {
    updateCount();
    if (isFrame) updateExposeIframes();
  }
}

async function init() {
  if (isUnstylable) return API.styleViaAPI({method: 'styleApply'});
  let data = isFrameNoUrl && CHROME && clone(parent[parent.Symbol.for(SYM_ID)]);
  if (data) await new Promise(onFrameElementInView);
  else data = !isFrameSameOrigin && !isXml && !chrome.tabs && tryCatch(getStylesViaXhr);
  // XML in Chrome will be auto-converted to html later, so we can't style it via XHR now
  await applyStyles(data);
  if (orphanCleanup) {
    dispatchEvent(new Event(orphanCleanup));
    orphanCleanup = false;
  }
}

async function applyStyles(data) {
  if (isOrphaned) return;
  if (!data) data = await API.styles.getSectionsByUrl(matchUrl, null, !own.sections);
  if (!data.cfg) data.cfg = own.cfg;
  Object.assign(own, window[Symbol.for(SYM_ID)] = data);
  if (!isFrame && own.cfg.top === '') own.cfg.top = location.origin; // used by child frames via parentStyles
  if (!isFrame && own.cfg.dark !== mqDark.matches) mqDark.onchange(mqDark);
  if (styleInjector.list.length) styleInjector.apply(own, true);
  else if (!own.cfg.off) styleInjector.apply(own);
  styleInjector.toggle(!own.cfg.off);
}

/** Must be executed inside try/catch */
function getStylesViaXhr() {
  const blobId = (document.cookie.split(chrome.runtime.id + '=')[1] || '').split(';')[0];
  if (!blobId) return; // avoiding an exception so we don't spoil debugging in devtools
  const url = 'blob:' + chrome.runtime.getURL(blobId);
  document.cookie = `${chrome.runtime.id}=1; max-age=0; SameSite=Lax`; // remove our cookie
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false); // synchronous
  xhr.send();
  URL.revokeObjectURL(url);
  return JSON.parse(xhr.response);
}

function applyOnMessage(req) {
  if (isUnstylable && /^(style|updateCount|urlChanged)/.test(req.method)) {
    API.styleViaAPI(req);
    return;
  }
  const {style} = req;
  switch (req.method) {
    case 'ping':
      return true;

    case 'styleDeleted':
      styleInjector.removeId(style.id);
      break;

    case 'styleUpdated':
      if (!own.sections && own.cfg.off) break;
      if (style.enabled) {
        API.styles.getSectionsByUrl(matchUrl, style.id).then(res =>
          res.sections.length
            ? styleInjector.apply(res)
            : styleInjector.removeId(style.id));
      } else {
        styleInjector.removeId(style.id);
      }
      break;

    case 'styleAdded':
      if ((own.sections || !own.cfg.off) && style.enabled) {
        API.styles.getSectionsByUrl(matchUrl, style.id)
          .then(styleInjector.apply);
      }
      break;

    case 'urlChanged':
      if (req.iid === instanceId && matchUrl !== req.url) {
        matchUrl = req.url;
        if (own.sections) applyStyles(own.cfg.off && {});
      }
      break;

    case 'updateCount':
      updateCount();
      break;

    case 'injectorConfig':
      updateConfig(req);
      break;

    case 'backgroundReady':
      // This may happen when reloading the background page without reloading the extension
      if (own.sections) updateCount();
      return true;
  }
}

function updateConfig({cfg}) {
  for (const k in cfg) {
    const v = cfg[k];
    if (v === own.cfg[k]) continue;
    if (k === 'top' && !isFrame) continue;
    own.cfg[k] = v;
    if (k === 'off') updateDisableAll();
    else if (k === 'order') styleInjector.sort();
    else if (k === 'top') updateExposeIframes();
    else styleInjector.updateConfig(own.cfg);
  }
}

function updateDisableAll() {
  if (isUnstylable) {
    API.styleViaAPI({method: 'injectorConfig', cfg: {off: own.cfg.off}});
  } else if (!own.sections && !own.cfg.off) {
    if (!offscreen) init();
  } else {
    styleInjector.toggle(!own.cfg.off);
  }
}

function updateExposeIframes() {
  const attr = 'stylus-iframe';
  const el = document.documentElement;
  if (!el) return; // got no styles so styleInjector didn't wait for <html>
  if (!own.cfg.top || !styleInjector.list.length) {
    if (el.hasAttribute(attr)) el.removeAttribute(attr);
  } else if (el.getAttribute(attr) !== own.cfg.top) { // Checking first to avoid DOM mutations
    el.setAttribute(attr, own.cfg.top);
  }
}

function updateCount() {
  if (!isTab || TDM < 0) return;
  if (isFrame) {
    if (!port && styleInjector.list.length) {
      port = chrome.runtime.connect({name: 'iframe'});
    } else if (port && !styleInjector.list.length) {
      port.disconnect();
      port = null;
    }
    if (lazyBadge && performance.now() > 1000) lazyBadge = false;
  }
  if (isUnstylable) API.styleViaAPI({method: 'updateCount'});
  else API.updateIconBadge(styleInjector.list.map(style => style.id), {lazyBadge, iid: instanceId});
}

function onFrameElementInView(cb) {
  parent[parent.Symbol.for('xo')](frameElement, cb);
  (offscreen || (offscreen = [])).push(cb);
}

/** @param {IntersectionObserverEntry[]} entries */
function onIntersect(entries) {
  for (const e of entries) {
    if (e.intersectionRatio) {
      xo.unobserve(e.target);
      e.target.dispatchEvent(new Event(xoEventId));
    }
  }
}

function onBFCache(e) {
  if (e.isTrusted && e.persisted) {
    apiPortDisconnect();
    updateCount();
  }
}

function onReified(e) {
  if (e.isTrusted) {
    TDM = window.TDM = 2;
    document.onprerenderingchange = null;
    API.styles.getSectionsByUrl('', 0, 'cfg').then(updateConfig);
    updateCount();
  }
}

function tryCatch(func, ...args) {
  try {
    return func(...args);
  } catch (e) {}
}

function orphanCheck(evt) {
  if (chrome.runtime.id) return;
  // In Chrome content script is orphaned on an extension update/reload
  // so we need to detach event listeners
  removeEventListener(evt.type, orphanCheck, true);
  removeEventListener('pageshow', onBFCache);
  removeEventListener('pagehide', onBFCache);
  if (mqDark) mqDark.onchange = null;
  if (offscreen) for (const fn of offscreen) fn();
  if (TDM < 0) document.onprerenderingchange = null;
  offscreen = null;
  isOrphaned = true;
  styleInjector.shutdown(evt.detail);
  tryCatch(msg.off, applyOnMessage);
}
