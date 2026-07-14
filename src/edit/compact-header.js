import {$create} from '@/js/dom';
import {mqCompact} from '@/js/dom-init';
import {important} from '@/js/dom-util';
import editor from './editor';

const h = $('#header');
export const toggleSticky = val => h.classList.toggle('sticky', val);
export let sticky;

export default function CompactHeader() {
  // Set up mini-header on scroll
  const {isUsercss} = editor;
  const sensor = $create('div', {
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
  const elIconized = $$('#header .i');
  $('#new-as').onclick = () => {
    if (!editor.style.id && !editor.dirty.isDirty()) {
      location.reload();
    }
  };
  scroller.appendChild(sensor);
  mqCompact(val => {
    if (val) {
      xo.observe(sensor);
    } else {
      xo.disconnect();
    }
    for (const el of elIconized)
      el.title = val ? el.textContent : '';
  });

  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    sticky = !entries.pop().intersectionRatio;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    toggleSticky(sticky);
  }
}
