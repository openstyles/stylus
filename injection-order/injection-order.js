/* global $ $create */// dom.js
/* global API */// msg.js
/* global DraggableList */
/* global prefs */
'use strict';

(async () => {
  const list = (await getOrderedStyles()).map(style => ({
    el: $create('li', [$create('span.dragger'), style.name]),
    style,
  }));
  const ol = $('#style-list');
  let maxTranslateY;
  ol.append(...list.map(l => l.el));
  ol.on('d:dragstart', e => {
    e.detail.origin.dataTransfer.setDragImage(new Image(), 0, 0);
    maxTranslateY = ol.scrollHeight - e.detail.dragTarget.offsetHeight - e.detail.dragTarget.offsetTop;
  });
  ol.on('d:dragmove', e => {
    e.detail.origin.dataTransfer.dropEffect = 'move';
    const y = Math.min(e.detail.currentPos.y - e.detail.startPos.y, maxTranslateY);
    e.detail.dragTarget.style.transform = `translateY(${y}px)`;
  });
  ol.on('d:dragend', e => {
    const [item] = list.splice(e.detail.originalIndex, 1);
    list.splice(e.detail.spliceIndex, 0, item);
    ol.insertBefore(e.detail.dragTarget, e.detail.insertBefore);
    prefs.set('injectionOrder', list.map(l => l.style._id));
  });
  new DraggableList(ol, {scrollContainer: ol});

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
