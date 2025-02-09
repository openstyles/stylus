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
  window.on('load', () => import('./dom-on-load'), {once: true});
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
