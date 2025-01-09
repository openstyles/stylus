import {$create, mqCompact} from '@/js/dom';
import {important} from '@/js/dom-util';
import {template} from '@/js/localization';
import * as prefs from '@/js/prefs';
import editor from './editor';

const h = template.body.$('#header');
export const toggleSticky = val => h.classList.toggle('sticky', val);
export let sticky;

export default function CompactHeader() {
  // Set up mini-header on scroll
  const {isUsercss} = editor;
  const elHeader = $create('div', {
    style: important(`
      top: 0;
      height: 1px;
      position: absolute;
      visibility: hidden;
    `),
  });
  const scroller = isUsercss ? $('.CodeMirror-scroll') : document.body;
  const xoRoot = isUsercss ? scroller : undefined;
  const xo = new IntersectionObserver(onScrolled, {root: xoRoot});
  const elInfo = $('h1 a');
  scroller.appendChild(elHeader);
  onCompactToggled(mqCompact);
  mqCompact.on('change', onCompactToggled);

  /** @param {MediaQueryList} mq */
  function onCompactToggled(mq) {
    for (const el of $$('details[data-pref]')) {
      el.open = mq.matches ? false :
        el.classList.contains('ignore-pref') ? el.open :
          prefs.get(el.dataset.pref);
    }
    if (mq.matches) {
      xo.observe(elHeader);
      $id('basic-info-name').after(elInfo);
    } else {
      xo.disconnect();
      $('h1').append(elInfo);
    }
  }

  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    sticky = !entries.pop().intersectionRatio;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    toggleSticky(sticky);
  }
}
