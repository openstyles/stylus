import {pFavicons, pFaviconsGray} from '@/js/consts';
import {ownRoot} from '@/js/urls';
import {$toggleClasses, header} from './dom';
import {getCssMediaRuleByName} from './dom-util';
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
  navigator.maxTouchPoints ? 'touch' : 'non-touch',
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

if (prefs.knownKeys.includes(
  header.prefId = (header.prefHub = 'headerWidth.') + location.pathname.match(/^.(\w*)/)[1]
)) (async () => {
  if (!__.MV3) await prefs.ready;
  (header.setWidth = width => {
    // If this is a small window on a big monitor the user can maximize it later
    const max = (innerWidth < 850 ? screen.availWidth : innerWidth) / 3;
    width = Math.round(Math.max(200, Math.min(max, Number(width) || 0)));
    $root.style.setProperty('--header-width', width + 'px');
    header.width = width;
    return width;
  })(prefs.__values[header.prefId]);
})();

window.on('load', () => import('./dom-on-load'), {once: true});
window.on('error', e => showUnhandledError(e.error));
window.on('unhandledrejection', e => showUnhandledError(e.reason));

function showUnhandledError(err) {
  // (c) tophf: reusing the function I wrote for Violentmonkey (MIT license)
  const id = 'unhandledError';
  const fontSize = 12;
  const el = document.getElementById(id) || document.createElement('textarea');
  const old = el.value;
  const cur = ([FIREFOX && err.message, err.stack].filter(Boolean).join('\n') || `${err}`)
    .trim().split(ownRoot).join('');
  const i = old.indexOf(cur);
  const text = el.value = i < 0
    ? [old, cur].filter(Boolean).join('\n\n')
    : old.slice(0, i).replace(/\((\d+) times\) $|$/, (s, num) => `(${++num || 1} times) `) +
      old.slice(i);
  const lines = text.split('\n');
  const height = fontSize * (lines.length + .5);
  const maxLen = lines.map(s => 1e9 + s.length).sort().pop() - 1e9;
  const parent = document.body || document.documentElement;
  const oldStyle = parent.style.cssText;
  el.id = id;
  el.readOnly = true;
  // using an inline style because we don't know if our CSS is loaded at this stage
  el.style.cssText = `\
    position:fixed;
    z-index:${1e9};
    left:0;
    right:0;
    bottom:0;
    background:darkred;
    transition:opacity .25s;
    cursor:copy;
    color:#fff;
    border-top: 2px solid #fff;
    padding: ${fontSize / 2}px;
    font: ${fontSize}px/1 sans-serif;
    box-sizing: content-box;
    height: ${height}px;
    max-height: 50vh;
    border: none;
    resize: none;
  `.replace(/;/g, '!important;');
  el.spellcheck = false;
  el.title = chrome.i18n.getMessage('copy');
  el.onclick ??= () => {
    el.select();
    if (document.execCommand('copy')) {
      el.remove();
      parent.style.cssText = oldStyle;
    }
  };
  parent.style.minHeight = height * 2 + 'px';
  parent.style.minWidth = maxLen * fontSize * .5 + 'px';
  parent.appendChild(el);
}
