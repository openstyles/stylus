/* global DraggableList */
/* global prefs */
/* global API */
'use strict';

(async () => {
  const list = (await getOrderedStyles()).map(createLi);
  const ol = document.querySelector('#style-list');
  let maxTranslateY;
  ol.append(...list.map(l => l.el));
  ol.addEventListener('d:dragstart', e => {
    e.detail.origin.dataTransfer.setDragImage(new Image(), 0, 0);
    maxTranslateY = ol.scrollHeight - e.detail.dragTarget.offsetHeight - e.detail.dragTarget.offsetTop;
  });
  ol.addEventListener('d:dragmove', e => {
    e.detail.origin.dataTransfer.dropEffect = 'move';
    const y = Math.min(e.detail.currentPos.y - e.detail.startPos.y, maxTranslateY);
    e.detail.dragTarget.style.transform = `translateY(${y}px)`;
  });
  ol.addEventListener('d:dragend', e => {
    const [item] = list.splice(e.detail.originalIndex, 1);
    list.splice(e.detail.spliceIndex, 0, item);
    ol.insertBefore(e.detail.dragTarget, e.detail.insertBefore);
    prefs.set('injectionOrder', list.map(l => l.style._id));
  });
  new DraggableList(ol, {scrollContainer: ol});
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
    for (const uid of prefs.get('injectionOrder')) {
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
