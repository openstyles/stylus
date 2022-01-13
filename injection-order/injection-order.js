/* global $create messageBoxProxy */// dom.js
/* global API */// msg.js
/* global DraggableList */
/* global prefs */
/* global t */// localization.js
'use strict';

/* exported InjectionOrder */
async function InjectionOrder(show = true) {
  if (!show) {
    return messageBoxProxy.close();
  }
  const entries = (await getOrderedStyles()).map(makeEntry);
  const ol = $create('ol');
  let maxTranslateY;
  ol.append(...entries.map(l => l.el));
  ol.on('d:dragstart', ({detail: d}) => {
    d.origin.dataTransfer.setDragImage(new Image(), 0, 0);
    maxTranslateY = ol.scrollHeight - d.dragTarget.offsetHeight - d.dragTarget.offsetTop;
  });
  ol.on('d:dragmove', ({detail: d}) => {
    d.origin.stopPropagation(); // preserves dropEffect
    d.origin.dataTransfer.dropEffect = 'move';
    const y = Math.min(d.currentPos.y - d.startPos.y, maxTranslateY);
    d.dragTarget.style.transform = `translateY(${y}px)`;
  });
  ol.on('d:dragend', ({detail: d}) => {
    const [item] = entries.splice(d.originalIndex, 1);
    entries.splice(d.spliceIndex, 0, item);
    ol.insertBefore(d.dragTarget, d.insertBefore);
    prefs.set('injectionOrder', entries.map(l => l.style._id));
  });
  DraggableList(ol, {scrollContainer: ol});

  await messageBoxProxy.show({
    title: t('styleInjectionOrder'),
    contents: $create('fragment', [
      $create('header', t('styleInjectionOrderHint')),
      ol,
    ]),
    className: 'injection-order center-dialog',
    blockScroll: true,
    buttons: [t('confirmClose')],
  });

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

  function makeEntry(style) {
    return {
      style,
      el: $create('a', {
        className: style.enabled ? 'enabled' : '',
        href: '/edit.html?id=' + style.id,
        target: '_blank',
      }, style.name),
    };
  }
}
