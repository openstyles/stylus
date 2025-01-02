import {$create, $createFragment} from '@/js/dom';
import DraggableList from '@eight04/draggable-list';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import {t} from '@/js/util';

export default async function InjectionOrder(show, el, selector) {
  if (!show) {
    return messageBox.close();
  }
  const SEL_ENTRY = '.injection-order-entry';
  const [groups] = await Promise.all([
    API.styles.getAllOrdered(['_id', 'id', 'name', 'enabled']),
    import('./injection-order.css'),
  ]);
  const ols = {};
  const parts = {};
  const entry = $create('li' + SEL_ENTRY, [
    parts.name = $create('a', {
      target: '_blank',
      draggable: false,
    }),
    $create('a.injection-order-toggle', {
      tabIndex: 0,
      draggable: false,
      title: t('styleInjectionImportance'),
    }),
  ]);
  await messageBox.show({
    title: t('styleInjectionOrder'),
    contents: $createFragment(Object.entries(groups).map(makeList)),
    className: 'center-dialog ' + selector.slice(1),
    blockScroll: true,
    buttons: [t('confirmClose')],
  });

  function makeEntry(style) {
    entry.classList.toggle('enabled', style.enabled);
    parts.name.href = '/edit.html?id=' + style.id;
    parts.name.textContent = style.name;
    return Object.assign(entry.cloneNode(true), {
      styleNameLC: style.name.toLocaleLowerCase(),
    });
  }

  function makeList([type, styles]) {
    const ids = groups[type] = styles.map(s => s._id);
    const ol = ols[type] = $create('ol.scroller');
    let maxTranslateY;
    ol.append(...styles.map(makeEntry));
    ol.on('d:dragstart', ({detail: d}) => {
      d.origin.dataTransfer.setDragImage(new Image(), 0, 0);
      maxTranslateY =
        ol.scrollHeight + ol.offsetTop - d.dragTarget.offsetHeight - d.dragTarget.offsetTop;
    });
    ol.on('d:dragmove', ({detail: d}) => {
      d.origin.stopPropagation(); // preserves dropEffect
      d.origin.dataTransfer.dropEffect = 'move';
      const y = Math.min(d.currentPos.y - d.startPos.y, maxTranslateY);
      d.dragTarget.style.transform = `translateY(${y}px)`;
    });
    ol.on('d:dragend', ({detail: d}) => {
      const [item] = ids.splice(d.originalIndex, 1);
      ids.splice(d.spliceIndex, 0, item);
      ol.insertBefore(d.dragTarget, d.insertBefore);
      API.styles.setOrder(groups);
    });
    ol.on('click', e => {
      if (e.target.closest('.injection-order-toggle')) {
        const elEntry = e.target.closest(SEL_ENTRY);
        const i = [].indexOf.call(elEntry.parentNode.children, elEntry);
        const [item] = ids.splice(i, 1);
        const type2 = type === 'main' ? 'prio' : 'main';
        groups[type2].push(item);
        ols[type2].appendChild(elEntry);
        API.styles.setOrder(groups);
      }
    });
    DraggableList(ol, {scrollContainer: ol});
    return $create(`section[data-${type}]`, [
      $create('header', t(`styleInjectionOrderHint${type === 'main' ? '' : '_' + type}`)),
      ol,
    ]);
  }
}
