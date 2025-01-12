import {$create} from '@/js/dom';
import {mqCompact} from '@/js/dom-init';
import {important} from '@/js/dom-util';
import {template} from '@/js/localization';
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
  mqCompact(val => {
    if (val) {
      xo.observe(elHeader);
      $id('basic-info-name').after(elInfo);
    } else {
      xo.disconnect();
      $('h1').append(elInfo);
    }
  });

  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    sticky = !entries.pop().intersectionRatio;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    toggleSticky(sticky);
  }
}
