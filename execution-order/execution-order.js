/* global Slip */
/* global prefs */
/* global API */
'use strict';

(async () => {
  const list = (await getOrderedStyles()).map(createLi);
  const ol = document.querySelector('#style-list');
  ol.append(...list.map(l => l.el));
  ol.addEventListener('slip:beforeswipe', e => e.preventDefault());
  ol.addEventListener('slip:beforewait', e => {
    if (e.target.classList.contains('dragger')) {
      e.preventDefault();
    }
  });
  ol.addEventListener('slip:reorder', e => {
    const [item] = list.splice(e.detail.originalIndex, 1);
    list.splice(e.detail.spliceIndex, 0, item);
    ol.insertBefore(e.target, e.detail.insertBefore);
    prefs.set('styles.order', list.map(l => l.style._id));
  });
  new Slip(ol);
  document.querySelector('#main').classList.add('ready');

  document.querySelector('.closer').addEventListener('click', () => {
    parent.dispatchEvent(new Event('closeOptions'));
  });

  function createLi(style) {
    const el = document.createElement('li');
    const dragger = document.createElement('span');
    dragger.className = 'dragger';
    el.append(dragger, style.name);
    return {el, style};
  }

  async function getOrderedStyles() {
    const [styles] = await Promise.all([
      API.styles.getAll(),
      prefs.ready,
    ]);
    const styleSet = new Set(styles);
    const uuidIndex = new Map();
    for (const s of styleSet) {
      uuidIndex.set(s._id, s);
    }
    const orderedStyles = [];
    for (const uid of prefs.get('styles.order')) {
      const s = uuidIndex.get(uid);
      if (s) {
        uuidIndex.delete(uid);

        orderedStyles.push(s);
        styleSet.delete(s);
      }
    }
    orderedStyles.push(...styleSet);
    return orderedStyles;
  }
})();
