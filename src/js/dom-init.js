import {pFavicons, pFaviconsGray} from '@/js/consts';
import {ownRoot} from '@/js/urls';
import {$toggleClasses, dom} from './dom';
import {getCssMediaRuleByName} from './dom-util';
import {tBody} from './localization';
import * as prefs from './prefs';
import {FIREFOX, MOBILE, OPERA, VIVALDI, WINDOWS} from './ua';
import './msg-init';
import './themer';
import './util-webext';
import '@/content/apply'; // must run after msg (swaps `API`) and util-webext (exposes _deepCopy)

export let mqCompact;

prefs.subscribe('disableAll', (_, val) => {
  $rootCL.toggle('all-disabled', val);
}, true);
prefs.subscribe([pFavicons, pFaviconsGray], (key, val) => {
  $rootCL.toggle(key === pFavicons ? 'has-favicons' : 'favicons-grayed', val);
}, true);

$root.classList.add(
  __.MV3 ? 'mv3' : 'mv2',
  MOBILE ? 'mobile' : 'desktop',
  WINDOWS ? 'windows' : 'non-windows',
  FIREFOX ? 'firefox' : 'chromium',
  ...OPERA ? ['opera'] : VIVALDI ? ['vivaldi'] : [],
);
// set language for a) CSS :lang pseudo and b) hyphenation
$root.lang = chrome.i18n.getUILanguage();

if ($rootCL.contains('normal-layout')) {
  let /** @type {MediaQueryList}*/ mq;
  const listeners = new Set();
  const toggleCompact = function ({matches: val}) {
    $toggleClasses($root, {
      'compact-layout': val,
      'normal-layout': !val,
    });
    for (const fn of listeners) fn(val);
  };
  mqCompact = fn => {
    listeners.add(fn);
    if (mq) fn(mq.matches);
  };
  prefs.subscribe('compactWidth', (k, val) => {
    mq = matchMedia(`(max-width: ${val}px)`);
    (mq.onchange = toggleCompact)(mq);
    getCssMediaRuleByName('compact', m => {
      k = m.mediaText.replace(/\d+/, val);
      if (m.mediaText !== k) m.mediaText = k;
    });
  }, true);
}

{
  // set up header width resizer
  const HW = 'headerWidth.';
  const HWprefId = HW + location.pathname.match(/^.(\w*)/)[1];
  if (prefs.knownKeys.includes(HWprefId)) {
    Object.assign(dom, {
      HW,
      HWprefId,
      setHWProp(width) {
        // If this is a small window on a big monitor the user can maximize it later
        const max = (innerWidth < 850 ? screen.availWidth : innerWidth) / 3;
        width = Math.round(Math.max(200, Math.min(max, Number(width) || 0)));
        $root.style.setProperty('--header-width', width + 'px');
        dom.HWval = width;
        return width;
      },
    });
    prefs.ready.then(() => dom.setHWProp(prefs.__values[HWprefId]));
  }
}

prefs.ready.then(() => tBody(() => {
  const mo = new MutationObserver(saveOnChange);
  const moCfg = {attributes: true, attributeFilter: ['open']};
  const SEL = 'details[data-pref]';
  for (const el of $$(SEL)) {
    prefs.subscribe(el.dataset.pref, updateOnPrefChange, true);
    mo.observe(el, moCfg);
  }
  mqCompact?.(val => {
    for (const el of $$(SEL))
      if (!el.matches('.ignore-pref'))
        el.open = (!val || !el.classList.contains('ignore-pref-if-compact'))
          && prefs.__values[el.dataset.pref];
  });
  function canSave(el) {
    return !el.matches('.ignore-pref, .compact-layout .ignore-pref-if-compact');
  }
  /** @param {MutationRecord[]} _ */
  function saveOnChange([{target: el}]) {
    if (canSave(el)) {
      prefs.set(el.dataset.pref, el.open);
    }
  }
  function updateOnPrefChange(key, value) {
    const el = $(`details[data-pref="${key}"]`);
    if (el.open !== value && canSave(el)) {
      el.open = value;
    }
  }
}));

window.on('load', () => import('./dom-on-load'), {once: true});
window.on('error', e => showUnhandledError(e.error));
window.on('unhandledrejection', e => showUnhandledError(e.reason));

function showUnhandledError(err) {
  // (c) tophf: reusing the function I wrote for Violentmonkey (MIT license)
  const id = 'unhandledError';
  const fontSize = 12;
  const el = document.getElementById(id) || document.createElement('textarea');
  const text = el.value = [
    el.value,
    [FIREFOX && err.message, err.stack].filter(Boolean).join('\n') || `${err}`,
  ].filter(Boolean).join('\n\n').trim().split(ownRoot).join('');
  const height = fontSize * (text.match(/^/gm).length + .5) + 'px';
  const parent = document.body || document.documentElement;
  el.id = id;
  el.readOnly = true;
  // using an inline style because we don't know if our CSS is loaded at this stage
  el.style.cssText = `\
    position:fixed;
    z-index:${1e9};
    left:0;
    right:0;
    bottom:0;
    background:red;
    color:#fff;
    border-top: 2px solid #fff;
    padding: ${fontSize / 2}px;
    font-size: ${fontSize}px;
    line-height: 1;
    box-sizing: content-box;
    height: ${height};
    max-height: 50vh;
    border: none;
    resize: none;
  `.replace(/;/g, '!important;');
  el.spellcheck = false;
  el.onclick = () => el.select();
  parent.style.minHeight = height;
  parent.appendChild(el);
}
