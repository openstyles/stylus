import {kSidebar, pFavicons, pFaviconsGray} from '@/js/consts';
import {isTab} from '@/js/msg-api';
import {ownRoot} from '@/js/urls';
import {mapObj, t} from '@/js/util';
import {MF} from '@/js/util-webext';
import {$toggleClasses, header, isSidebar, isTouch} from './dom';
import {getCssMediaRuleByName, important} from './dom-util';
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

$rootCL.add(
  __.MV3 ? 'mv3' : 'mv2',
  MOBILE ? 'mobile' : 'desktop',
  WINDOWS ? 'windows' : 'non-windows',
  __.B_FIREFOX || __.B_ANY && FIREFOX ? 'firefox' : 'chromium',
  ...OPERA ? ['opera'] : VIVALDI ? ['vivaldi'] : [],
  ...isSidebar ? [kSidebar] : isTab ? ['tab'] : [],
  isTouch ? 'touch' : 'non-touch',
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
      const s1 = m.mediaText;
      const s2 = s1.replace(/((?:(min-)|max-)?width\W+)\d+/g,
        (s, prop, min) => prop + (min ? val + 1 : val));
      if (s1 !== s2) m.mediaText = s2;
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
  const elOld = $id(id);
  const el = elOld || $tag('div');
  const elText = el.$('textarea') || $tag('textarea');
  const elLink = el.$('a') || $tag('a');
  const old = elText.value;
  const cur = (
    [(__.B_FIREFOX || __.B_ANY && FIREFOX) && err.message, err.stack]
      .filter(Boolean).join('\n')
    || `${err}`
  ).trim().split(ownRoot).join('');
  const i = old.indexOf(cur);
  const text = elText.value = i < 0
    ? [old, cur].filter(Boolean).join('\n\n')
    : old.slice(0, i).replace(/\((\d+) times\) $|$/, (s, num) => `(${++num || 1} times) `) +
      old.slice(i);
  const lines = text.split('\n');
  const height = fontSize * (lines.length + .5);
  const maxLen = lines.map(s => 1e9 + s.length).sort().pop() - 1e9;
  const parent = $root;
  const formattedText = '```\n' + elText.value + '\n```\n\n' +
    navigator.userAgent.replace(
      /^.*\((\S+)\s+\D*(\d+).*?\)[^(]+[^)]+\)\s+(.+?)\/(\d+).*/,
      '- OS: $1 $2\n- Browser: $3 $4\n') +
    `- Stylus: ${MF.version} (MV${__.MV3 ? 3 : 2})\n`;
  const shownBody = '...';
  let oldStyle = parent._style ??= mapObj(parent.style, null, ['minHeight', 'minWidth']);
  el.id = id;
  // using an inline style because we don't know if our CSS is loaded at this stage
  el.style.cssText = `\
    position:fixed;
    z-index:${1e9};
    left:0;
    right:0;
    bottom:0;
    background:darkred;
    transition:opacity .25s;
    color:#fff;
    border-top: 2px solid #fff;
    padding: 1ex 1em;
    font: ${fontSize}px/1 sans-serif;
    box-sizing: content-box;
    display: flex;
    flex-flow: wrap;
    align-items: center;
    gap: 1rem;
  `.replace(/;/g, '!important;');
  elLink.href = (
    elLink.title = 'https://github.com/openstyles/stylus/issues/new?' + new URLSearchParams({
      title: `${location.pathname.slice(1, -5/*drop ".html"*/)}: Unhandled error ${err.message}`,
      labels: 'bug',
      body: shownBody,
    })
  ).slice(0, -shownBody.length) + encodeURIComponent(formattedText);
  if (!elOld) {
    const inherited = `font: inherit; color: inherit;`;
    const elCopy = $tag('button');
    elText.readOnly = true;
    elText.spellcheck = false;
    elText.style.cssText = important(inherited + `\
      background: none;
      flex: 1 1 auto;
      height: ${height}px;
      max-height: 50vh;
      border: none;
      resize: none;
    `);
    elCopy.append(t('copy'));
    elLink.append(t('reportBug'));
    elCopy.onclick =
    elLink.onclick = function () {
      if (!this.href)
        navigator.clipboard.writeText(formattedText);
      el.remove();
      Object.assign(parent.style, oldStyle);
      oldStyle = parent._style = null;
    };
    elLink.target = '_blank';
    elLink.rel = 'noopener';
    elLink.style.cssText = important(inherited);
    el.append(elLink, elCopy, elText);
  }
  parent.style.minHeight = height * 2 + 'px';
  parent.style.minWidth = maxLen * fontSize * .5 + 'px';
  parent.appendChild(el);
}
