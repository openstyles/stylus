// WARNING: make sure util-webext.js runs first and sets _deepCopy
import {k_deepCopy, kApplyPort} from '@/js/consts';
import * as msg from '@/js/msg';
import {API, isFrame, TDM, updateTDM} from '@/js/msg-api';
import * as styleInjector from './style-injector';
import {FF, isXml, own, ownId} from './style-injector';

const SYM_ID = 'styles';
const kPageShow = 'pageshow';
const kBeforeUnload = 'beforeunload';
const isUnstylable = FF && isXml;
const clone = __.ENTRY
  ? global[k_deepCopy] // will be used in extension context
  : val => typeof val === 'object' && val ? JSON.parse(JSON.stringify(val)) : val;
let isFrameSameOrigin = false;
if (isFrame) {
  try {
    isFrameSameOrigin = Object.getOwnPropertyDescriptor(parent.location, 'href');
    isFrameSameOrigin = !!isFrameSameOrigin?.get;
  } catch {}
}
const isFrameNoUrl = isFrameSameOrigin && location.protocol === 'about:';

/** Polyfill for documentId in Firefox and Chrome pre-106 */
const instanceId = (FF || !CSS.supports('top', '1ic')) && (Math.random() || Math.random());
/** about:blank iframes are often used by sites for file upload or background tasks,
 * and they may break if unexpected DOM stuff is present at `load` event
 * so we'll add the styles only if the iframe becomes visible */
const xoEventId = `${instanceId}`;

// FIXME: move this to background page when following bugs are fixed:
// https://bugzil.la/1587723, https://crbug.com/968651
const mqDark = !isFrame && matchMedia('(prefers-color-scheme: dark)');

// dynamic iframes don't have a URL yet so we'll use their parent's URL (hash isn't inherited)
let matchUrl = isFrameNoUrl
  ? parent.location.href.split('#')[0]
  : location.href;
let offscreen;
/** @type chrome.runtime.Port */
let port;
let throttled;
let throttledCount;
let lazyBadge = isFrame;
/** @type IntersectionObserver */
let xo;

if (!FF) {
  window[Symbol.for('xo')] = (el, cb) => {
    if (!xo) xo = new IntersectionObserver(onIntersect, {rootMargin: '100%'});
    el.addEventListener(xoEventId, cb, {once: true});
    xo.observe(el);
  };
}
if (mqDark) {
  mqDark.onchange = ({matches: m}) => {
    if (m !== own.cfg.dark) API.setSystemDark(own.cfg.dark = m);
  };
}
if (TDM < 0) {
  document.onprerenderingchange = onReified;
}
styleInjector.onInjectorUpdate = () => {
  updateCount();
  if (isFrame) {
    updateExposeIframes();
    (styleInjector.list.length ? addEventListener : removeEventListener)(
      kBeforeUnload, onBeforeUnload, true);
  }
};
styleInjector.orphanCheck = orphanCheck;
// Declare all vars before init() or it'll throw due to "temporal dead zone" of const/let
init();
msg.onMessage(applyOnMessage, true);
addEventListener(kPageShow, onBFCache);

async function init() {
  if (isUnstylable) return API.styleViaAPI({method: 'styleApply'});
  let data;
  if (__.ENTRY && (data = global.clientData)) {
    data = (/**@type{StylusClientData}*/__.MV3 ? data : await data).apply;
  } else {
    data = isFrameNoUrl && !FF && clone(parent[parent.Symbol.for(SYM_ID)]);
    if (data) await new Promise(onFrameElementInView);
    else data = !__.ENTRY && !isFrameSameOrigin && !isXml && getStylesViaXhr();
    // XML in Chrome will be auto-converted to html later, so we can't style it via XHR now
  }
  if (!orphanCheck()) return;
  await applyStyles(data);
}

async function applyStyles(data) {
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
  try {
    const blobId = (document.cookie.split(ownId + '=')[1] || '').split(';')[0];
    if (!blobId) return; // avoiding an exception so we don't spoil debugging in devtools
    const url = 'blob:' + chrome.runtime.getURL(blobId);
    document.cookie = `${ownId}=1; max-age=0; SameSite=Lax`; // remove our cookie
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // synchronous
    xhr.send();
    return JSON.parse(xhr.response);
  } catch {}
}

function applyOnMessage(req, sender, multi) {
  if (isUnstylable && /^(style|urlChanged)/.test(req.method)) {
    API.styleViaAPI(req);
    return;
  }
  if (multi) {
    throttled ??= Promise.resolve().then(processThrottled) && [];
    throttled.push(req);
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

    case 'injectorConfig':
      updateConfig(req);
      break;

    case 'backgroundReady':
      // This may happen when restarting the background script without reloading the extension
      if (own.sections) updateCount();
      return true;
  }
}

function processThrottled() {
  for (const req of throttled)
    applyOnMessage(req);
  throttled = null;
  updateCount();
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
  let ids, str;
  if (TDM < 0) return;
  if (isFrame && lazyBadge && performance.now() > 1000) lazyBadge = false;
  if (isUnstylable) API.styleViaAPI({method: 'updateCount'});
  else if (!throttled
  && throttledCount !== (str = (ids = [...styleInjector.table.keys()]).join(','))) {
    API.updateIconBadge(ids, {lazyBadge, iid: instanceId});
    throttledCount = str;
  }
}

function onFrameElementInView(cb) {
  parent[parent.Symbol.for('xo')](frameElement, cb);
  (offscreen || (offscreen = [])).push(cb);
}

/** @param {IntersectionObserverEntry[]} entries */
function onIntersect(entries) {
  if (!orphanCheck()) return;
  for (const e of entries) {
    if (e.intersectionRatio) {
      xo.unobserve(e.target);
      e.target.dispatchEvent(new Event(xoEventId));
    }
  }
}

function onBeforeUnload(e) {
  if (orphanCheck() && e.isTrusted && !port) {
    port = chrome.runtime.connect({name: kApplyPort});
    port.onDisconnect.addListener(() => (port = null));
  }
}

function onBFCache(e) {
  if (orphanCheck() && e.isTrusted && e.persisted) {
    throttledCount = '';
    updateCount();
  }
}

function onReified(e) {
  if (!orphanCheck()) return;
  if (e.isTrusted) {
    updateTDM(2);
    document.onprerenderingchange = null;
    API.styles.getSectionsByUrl('', 0, 'cfg').then(updateConfig);
    updateCount();
  }
}

function orphanCheck() {
  // id will be undefined if the extension is orphaned
  if (chrome.runtime.id) return true;
  // In Chrome content script is orphaned on an extension update/reload
  // so we need to detach event listeners
  removeEventListener(ownId, orphanCheck, true);
  removeEventListener(kPageShow, onBFCache);
  removeEventListener(kBeforeUnload, onBeforeUnload, true);
  if (mqDark) mqDark.onchange = null;
  if (offscreen) for (const fn of offscreen) fn();
  if (TDM < 0) document.onprerenderingchange = null;
  offscreen = null;
  styleInjector.shutdown();
  msg.off(applyOnMessage);
}
