import {$create} from '@/js/dom';
import {mqCompact} from '@/js/dom-init';
import {important} from '@/js/dom-util';
import {template} from '@/js/localization';
import {t} from '@/js/util';
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
  const elNewAs = $('#new-as');
  const elInfo = [...$$('#heading a')];
  const hint = t('newStyleAsUserCSSHint');
  const elDocs = $('#usercss-docs');
  const docs = elDocs.title = t('externalUsercssDocument');
  const docsUrl = elDocs.href = 'https://github.com/openstyles/stylus/wiki/Writing-UserCSS';
  elNewAs.on('click', () => {
    if (!editor.style.id && !editor.dirty.isDirty()) {
      location.reload();
    }
  });
  elNewAs.$('a').title = `${docs}:\n${docsUrl}\n${hint}`;
  elNewAs.$('a').dataset.title = `<a href="${docsUrl}">${docs}</a>\n\n${hint}`;
  scroller.appendChild(elHeader);
  mqCompact(val => {
    if (val) {
      xo.observe(elHeader);
      $id('basic-info-name').append(...elInfo);
    } else {
      xo.disconnect();
      $id('heading').append(...elInfo);
    }
  });

  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    sticky = !entries.pop().intersectionRatio;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    toggleSticky(sticky);
  }
}
