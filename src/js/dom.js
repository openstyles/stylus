import {$, dom} from './dom-base';
import {waitForSelector} from './dom-util';
import * as prefs from './prefs';
import {FIREFOX, OPERA, VIVALDI, WINDOWS} from './toolbox';
import '/content/apply'; // must run after msg (swaps `API`) and toolbox (exposes _deepCopy)
import './themer';

export * from './dom-base';
export * from './dom-util';

prefs.subscribe('disableAll', (_, val) => {
  $.rootCL.toggle('all-disabled', val);
}, true);

prefs.ready.then(() => {
  waitForSelector('details[data-pref]', {
    recur(elems) {
      for (const el of elems) {
        prefs.subscribe(el.dataset.pref, updateOnPrefChange, true);
        new MutationObserver(saveOnChange)
          .observe(el, {attributes: true, attributeFilter: ['open']});
      }
    },
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
});

{
  const cls = (!WINDOWS ? 'non-windows ' : '') +
    (FIREFOX ? 'firefox' : OPERA ? 'opera' : VIVALDI ? 'vivaldi' : '');
  if (cls) $.root.className += ' ' + cls;
  // set language for a) CSS :lang pseudo and b) hyphenation
  $.root.setAttribute('lang', chrome.i18n.getUILanguage());
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
        $.root.style.setProperty('--header-width', width + 'px');
        dom.HWval = width;
        return width;
      },
    });
    prefs.ready.then(() => dom.setHWProp(prefs.get(HWprefId)));
  }
  window.on('load', () => import('./dom-on-load'), {once: true});
}
