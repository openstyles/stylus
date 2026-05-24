import {kSidebar, pFavicons, pFaviconsGray} from '@/js/consts';
import {isTab} from '@/js/msg-api';
import {ownRoot} from '@/js/urls';
import {t} from '@/js/util';
import {MF} from '@/js/util-webext';
import {$create, $toggleClasses, header, isSidebar, isTouch} from './dom';
import {getCssMediaRuleByName} from './dom-util';
import * as prefs from './prefs';
import {FIREFOX, MOBILE, OPERA, VIVALDI, WINDOWS} from './ua';
import './msg-init';
import './themer';
import './util-webext';
import '@/content/apply'; // must run after msg (swaps `API`) and util-webext (exposes _deepCopy)

export let mqCompact;
let elError, elErrorLink;

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
/** onerror() is called from prefs.js directly to avoid importing this DOM module in bg */
window.onerror = window.onunhandledrejection = showUnhandledError;

export function showUnhandledError(a, b, c, d, err = a /* window.onerror has 5 params */) {
  err = err.reason || err; // for onunhandledrejection
  if (!elError) {
    elError = $tag('div');
    elError.id = 'unhandledError';
    const elCopy = $create('a', {tabIndex: 0, title: t('copy')});
    const elClose = $create('a', {tabIndex: 0, title: t('confirmClose')});
    elCopy.append($create('i.i-copy'));
    elClose.append($create('i.i-close'));
    elErrorLink = $create('a', {target: '_blank', rel: 'noopener'}, t('reportBug'));
    elError.append(elErrorLink, elCopy, elClose);
    elError.onclick = ({target}) => {
      if (target === elError || target.closest('details'))
        return;
      if (target === elCopy)
        navigator.clipboard.writeText(formattedText);
      elError.remove();
    };
  }
  const msg = (`${err.message || err}`).trim().split(ownRoot).join('') + '\n';
  let el = [].find.call(elError.$$('summary'), s => s.innerText === msg);
  if (el) {
    el.dataset.num = (+el.dataset.num || 1) + 1;
  } else {
    elError.appendChild($tag('details')).append(
      el = $create('summary', msg),
      err.stack?.replace(msg, '') || '',
    );
  }
  const parent = $root;
  const formattedText = '```\n' +
    [].map.call(elError.$$('details'), _ => _.innerText).join('\n\n') +
    '\n```\n\n' +
    navigator.userAgent.replace(
      /^.*\((\S+)\s+\D*(\d+).*?\)[^(]+[^)]+\)\s+(.+?)\/(\d+).*/,
      '- OS: $1 $2\n- Browser: $3 $4\n') +
    `- Stylus: ${MF.version} (MV${__.MV3 ? 3 : 2})\n`;
  const shownBody = '...';
  elErrorLink.href = (
    elErrorLink.title = 'https://github.com/openstyles/stylus/issues/new?' + new URLSearchParams({
      title: `${location.pathname.slice(1, -5/*drop ".html"*/)}: Unhandled error ${err.message}`,
      labels: 'bug',
      body: shownBody,
    })
  ).slice(0, -shownBody.length) + encodeURIComponent(formattedText);
  parent.appendChild(elError);
}
