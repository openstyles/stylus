import {kSidebar, pFavicons, pFaviconsGray} from '@/js/consts';
import {isTab} from '@/js/msg-api';
import {swController} from '@/js/msg-init';
import {$toggleClasses, header, isSidebar, isTouch} from './dom';
import {getCssMediaRuleByName} from './dom-util';
import {tBody} from './localization';
import * as prefs from './prefs';
import {FIREFOX, MOBILE, OPERA, VIVALDI, WINDOWS} from './ua';
import './dom-error';
import './msg-init';
import './themer';
import './util-webext';
import '@/content/apply'; // must run after msg (swaps `API`) and util-webext (exposes _deepCopy)

export let mqCompact;

global[__.PREFS] = prefs; // similarly to global.API exposing it for debugging
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
  if (!__.MV3 || !swController)
    await prefs.ready;
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
tBody();
