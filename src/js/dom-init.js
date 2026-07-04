import {kSidebar, pFavicons, pFaviconsGray} from '@/js/consts';
import {isTab} from '@/js/msg-api';
import {isSidebar} from '@/js/util';
import {$root, $rootCL, $toggleClasses, isTouch} from './dom';
import {getCssMediaRuleByName} from './dom-util';
import HeaderResizer from './header-resizer';
import {tBody} from './localization';
import * as prefs from './prefs';
import {FIREFOX, MOBILE, OPERA, VIVALDI, WINDOWS} from './ua';
import './dom-error';
import './dom-on-load';
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

tBody();
if ($id('header')) HeaderResizer();
