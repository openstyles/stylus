import * as msgApi from '@/js/msg-api';

// allows Terser to drop unused code in targeted builds
export const FF = __.BUILD !== 'chrome' && msgApi.FF;
const CLASS = 'stylus';
const PREFIX = CLASS + '-';
const MEDIA = 'screen, ' + PREFIX;
const PATCH_ID = 'transition-patch';
const kAss = 'adoptedStyleSheets';
export const own = /** @type {Injection.Response} */{
  cfg: {off: false, top: ''},
};
export const runtime = chrome.runtime;
export const ownId = runtime.id;
export const isXml = !__.ENTRY && document instanceof XMLDocument;
const wrappedDoc = __.BUILD !== 'chrome' && FF && document.wrappedJSObject
  || document;
// styles are out of order if any of these elements is injected between them
// except `style` on our own page as it contains overrides
const ORDERED_TAGS = new Set(['head', 'body', 'frameset', !__.ENTRY && 'style', 'link']);
const docRewriteObserver = !__.ENTRY && RewriteObserver(updateRoot);
const docRootObserver = RootObserver(restoreOrder);
const toSafeChar = c => String.fromCharCode(0xFF00 + c.charCodeAt(0) - 0x20);
/** @type {Injection.Sections[]} */
export const list = [];
const randomIds = {};
const calcOrder = ({id}) => orderPrio[id] * 1e6 || orderMain[id] || id + .5e6;
const compare = (a, b) => calcOrder(a) - calcOrder(b);
/** @type {Map<number,Injection.Sections>} */
export const table = new Map();
/** @type {CSSStyleSheet[]} V1: frozen array in old Chrome, the reference changes */
let ass;
/** @type {CSSStyleSheet[]} V2: mutable array, the reference doesn't change */
let assV2;
/** @type {(haystack: CSSStyleSheet[], needle: CSSStyleSheet) => number} */
let assIndexOf;
let root = document.documentElement;
let isEnabled = true;
let isTransitionPatched;
let exposeStyleName;
let ffCsp; // circumventing CSP via a non-empty textContent, https://bugzil.la/1706787
let nonce = '';
let reorderCnt = 0;
let reorderStart = 0;
// will store the original method refs because the page can override them
let creationDoc, createElement, createElementNS;
let orderPrio, orderMain;
export let onInjectorUpdate, selfDestruct;

export function shutdown() {
  if (!list.length) return;
  toggleObservers(false);
  removeAllElements();
  list.length = 0;
  table.clear();
}

export function removeId(id) {
  if (removeStyle(table.get(id))) emitUpdate();
}

export function toggle(enable) {
  enable = !!enable;
  if (isEnabled === enable) return;
  isEnabled = enable;
  if (enable) addAllElements();
  else removeAllElements();
}

function addElement(el, before) {
  if (ass) {
    const sheets = assV2 || wrappedDoc[kAss].slice();
    let i = assIndexOf(sheets, el);
    if (i >= 0) el = sheets.splice(i, 1)[0];
    i = before ? assIndexOf(sheets, before) : -1;
    if (i >= 0) sheets.splice(i, 0, el);
    else sheets.push(el);
    if (!assV2) wrappedDoc[kAss] = sheets;
  } else {
    updateRoot().insertBefore(el, before);
  }
  return el;
}

function addAllElements() {
  if (!list.length) return;
  toggleObservers(false);
  if (ass) replaceAss(true);
  else updateRoot().append(...list.map(s => s.el));
  toggleObservers(true);
}

function removeElement(el) {
  if (el.remove) {
    el.remove();
  } else if (ass) {
    const sheets = assV2 || wrappedDoc[kAss].slice();
    const i = assIndexOf(sheets, el);
    if (i >= 0) {
      sheets.splice(i, 1);
      if (!assV2) wrappedDoc[kAss] = sheets;
    }
  }
}

function removeAllElements() {
  toggleObservers(false);
  if (ass) replaceAss();
  else for (const {el} of list) removeElement(el);
}

function replaceAss(readd) {
  const elems = list.map(s => s.el);
  const res = !__.ENTRY && FF ? cloneInto([], wrappedDoc) /* global cloneInto */ : [];
  for (let arr = assV2 || wrappedDoc[kAss], i = 0, el; i < arr.length && (el = arr[i]); i++) {
    if (assIndexOf(elems, el) < 0) res.push(el);
  }
  if (readd) res.push(...elems);
  wrappedDoc[kAss] = res;
}

export function apply({cfg, sections}, isReplace) {
  if (cfg) updateConfig(cfg);
  const ids = isReplace && new Set();
  for (const style of sections) {
    const {id, code} = style;
    const codeStr = Array.isArray(code)
      ? style.code = code.join('')
      : code;
    const old = table.get(id);
    if (!old) {
      style.el = createStyle(style);
      table.set(id, style);
      const i = list.findIndex(item => calcOrder(item) > calcOrder(style));
      list.splice(i < 0 ? list.length : i, 0, style);
    } else if (old.code !== codeStr
      || exposeStyleName && old.name !== style.name
    ) {
      old.code = codeStr;
      setTextAndName(old.el, style);
      old.el.disabled = false;
    }
    if (isReplace) ids.add(id);
  }
  toggleObservers(false);
  if (isReplace && list.length > ids.size) {
    for (let i = list.length, s; --i >= 0;) if (!ids.has((s = list[i]).id)) removeStyle(s);
  }
  if (isEnabled) {
    if (!isTransitionPatched) applyTransitionPatch(sections);
    restoreOrder();
  }
  emitUpdate();
}

function applyTransitionPatch(styles) {
  isTransitionPatched = true;
  // CSS transition bug workaround: since we insert styles asynchronously,
  // the browsers, especially Firefox, may apply all transitions on page load
  if (document.readyState === 'complete' ||
      document.visibilityState === 'hidden' ||
      !styles.some(s => s.code.includes('transition'))) {
    return;
  }
  const el = createStyle({
    id: PATCH_ID,
    code: ':not(#\\0):not(#\\0) { transition: none !important }',
  });
  addElement(el);
  // wait for the next paint to complete
  // note: requestAnimationFrame won't fire in inactive tabs
  requestAnimationFrame(() => setTimeout(removeElement, 0, el));
}

function createStyle(style) {
  let el;
  let {id} = style;
  if (ass) {
    if (!exposeStyleName)
      id = randomIds[id] ??= Math.random().toString(36).slice(2);
    id = MEDIA + id;
    el = new CSSStyleSheet({media: id});
    setTextAndName(el, style);
    for (let arr = assV2 || wrappedDoc[kAss], i = 0, m; i < arr.length; i++) {
      if ((m = arr[i].media).mediaText === id) m.mediaText += '-old';
    }
    return el;
  }
  if (!creationDoc && (el = initCreationDoc(style))) {
    return el;
  }
  if (!__.ENTRY && root instanceof SVGSVGElement) {
    // SVG document style
    el = createElementNS('http://www.w3.org/2000/svg', 'style');
  } else if (isXml) {
    // XML document style
    el = createElementNS('http://www.w3.org/1999/xhtml', 'style');
  } else {
    // HTML document style; also works on HTML-embedded SVG
    el = createElement('style');
  }
  if (nonce)
    el.nonce = nonce;
  if (id && exposeStyleName) // not exposing it by default to reduce fingerprint
    id = el.id = `${PREFIX}${id}`;
  // SVG className is not a string, but an instance of SVGAnimatedString
  el.classList.add(CLASS);
  setTextAndName(el, style);
  return el;
}

function setTextAndName(el, {id, code, name}) {
  if (ass) {
    try {
      el.replaceSync(code);
    } catch {
      el.replace(code);
    }
    return;
  }
  if (exposeStyleName && name) {
    if (el.dataset.name !== name) el.dataset.name = name;
    if (!FF) { // Firefox doesn't support sourceURL comment in CSS
      name = encodeURIComponent(name.replace(/[?#/']/g, toSafeChar));
      code += `\n/*# sourceURL=${runtime.getURL(name)}.user.css#${id}${
        window !== top ? '#' + Math.random().toString(36).slice(2) : '' // https://crbug.com/1298600
      } */`;
    }
  }
  // Reusing the text node to trigger a CharacterData mutation which is less frequently observed
  (el.firstChild || el).textContent = code;
}

function toggleObservers(shouldStart) {
  if (ass && shouldStart) return;
  const onOff = shouldStart && isEnabled ? 'start' : 'stop';
  if (!__.ENTRY) docRewriteObserver[onOff]();
  docRootObserver[onOff]();
}

function emitUpdate() {
  toggleObservers(list.length);
  onInjectorUpdate();
}

function initAss() {
  if (assIndexOf) return;
  if (Object.isExtensible(ass)) assV2 = ass;
  assIndexOf = !FF
    ? Object.call.bind([].indexOf)
    : (arr, {media: {mediaText: id}}) => {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].media.mediaText === id) return i;
      }
      return -1;
    };
}

/*
FF59+ workaround: allow the page to read our sheets, https://github.com/openstyles/stylus/issues/461
First we're trying the page context document where inline styles may be forbidden by CSP
https://bugzilla.mozilla.org/show_bug.cgi?id=1579345#c3
and since userAgent.navigator can be spoofed via about:config or devtools,
we're checking for getPreventDefault that was removed in FF59
*/
function initCreationDoc(style) {
  creationDoc = FF && Event.prototype.getPreventDefault ? document : wrappedDoc;
  for (let retry = 0, el, ok; !ok && retry < 2; retry++) {
    createElement = creationDoc.createElement.bind(creationDoc);
    createElementNS = creationDoc.createElementNS.bind(creationDoc);
    if (!FF) {
      return;
    }
    if (!retry || ffCsp) {
      try {
        el = addElement(createStyle({code: 'a:not(a){}'}));
        ok = el.sheet;
        removeElement(el);
        if (ok) return;
      } catch {}
    }
    if (retry && ffCsp && (ass = wrappedDoc[kAss])) { // ffCsp bug got fixed
      initAss();
      console.debug(
        'Stylus switched to document.adoptedStyleSheets due to a strict CSP of the page');
      return createStyle(style);
    }
    creationDoc = document;
  }
}

function removeStyle(style) {
  if (!style) return;
  table.delete(style.id);
  list.splice(list.indexOf(style), 1);
  removeElement(style.el);
  return true;
}

function restoreOrder(mutations) {
  if (!runtime.id)
    return selfDestruct();
  let bad;
  let el = list.length && list[0].el;
  if (!el) {
    bad = false;
  } else if (ass) {
    if (!assV2) ass = wrappedDoc[kAss];
    for (let len = list.length, base = ass.length - len, i = 0; i < len; i++) {
      if (base < 0 || (
        !FF
          ? ass[base + i] !== list[i].el
          : ass[base + i].media.mediaText !== list[i].el.media.mediaText
      )) {
        bad = true;
        break;
      }
    }
  } else if (el.parentNode !== creationDoc.documentElement) {
    bad = true;
  } else {
    let i = 0;
    while (el) {
      if (i < list.length && el === list[i].el) {
        i++;
      } else if (ORDERED_TAGS.has(el.localName)) {
        bad = true;
        break;
      }
      el = el.nextElementSibling;
    }
    // some styles are not injected to the document
    if (i < list.length) bad = true;
  }
  if (!bad) return;
  if (!mutations || ++reorderCnt < 10) addAllElements();
  else console.debug(`Stylus ignored wrong order of styles to avoid an infinite loop of mutations.`); // eslint-disable-line max-len
  const t = performance.now();
  if (t - reorderStart > 250) {
    reorderCnt = 0;
    reorderStart = t;
  }
}

export function sort() {
  list.sort(compare);
  if (isEnabled) addAllElements();
}

export function updateConfig(cfg) {
  exposeStyleName = cfg.name;
  nonce = cfg.nonce || nonce;
  ffCsp = !nonce && !__.ENTRY && FF && isSecureContext;
  ({main: orderMain = {}, prio: orderPrio = {}} = cfg.order || {});
  if (!ass !== !cfg.ass) {
    removeAllElements();
    ass = ass ? null : wrappedDoc[kAss];
    if (ass) initAss();
    for (const s of list) s.el = createStyle(s);
    addAllElements();
  }
}

function updateRoot() {
  if (!runtime.id)
    return selfDestruct();
  // Known to change mysteriously in iframes without triggering RewriteObserver
  if (root !== document.documentElement) {
    root = document.documentElement;
    addAllElements();
    docRootObserver.restart();
  }
  return root;
}

function RewriteObserver(check) {
  // detect documentElement being rewritten from inside the script
  let observing = false;
  let timer;
  const observer = new MutationObserver(check);
  return {start, stop};

  function start() {
    if (observing || ass) return;
    // detect dynamic iframes rewritten after creation by the embedder i.e. externally
    root = document.documentElement;
    timer = setTimeout(check);
    observer.observe(document, {childList: true});
    observing = true;
  }
  function stop() {
    if (!observing) return;
    clearTimeout(timer);
    observer.disconnect();
    observing = false;
  }
}

function RootObserver(onChange) {
  let observing = false;
  const observer = new MutationObserver(onChange);
  return {start, stop, restart};
  function start() {
    if (observing || ass) return;
    observer.observe(root, {childList: true});
    observing = true;
  }
  function stop() {
    if (!observing) return;
    observer.disconnect();
    observing = false;
  }
  function restart() {
    if (observing) {
      stop();
      start();
    }
  }
}
