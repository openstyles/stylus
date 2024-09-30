var DraggableList = (function () {
  'use strict';

  /* eslint-env browser */
  const CLS_TRANSFORMED = 'draggable-list-transformed';
  function posToIndex(rects, startIndex, y, bound) {
    if (y < rects[0].top && bound) return startIndex;

    for (let i = 0; i < startIndex; i++) {
      if (rects[i].bottom < y) continue;
      return i;
    }

    if (y > rects[rects.length - 1].bottom && bound) return startIndex;

    for (let i = rects.length - 1; i > startIndex; i--) {
      if (rects[i].top > y) continue;
      return i;
    }

    return startIndex;
  }
  function applyTransform(list, startIndex, oldIndex, newIndex, len) {
    if (newIndex > oldIndex) {
      transform(false, oldIndex, Math.min(startIndex - 1, newIndex - 1));

      if (startIndex < list.length - 1) {
        transform(true, Math.max(oldIndex + 1, startIndex + 1), newIndex, "translateY(".concat(-len, "px)"));
      }
    } else {
      transform(false, Math.max(startIndex + 1, newIndex + 1), oldIndex);

      if (startIndex > 0) {
        transform(true, newIndex, Math.min(oldIndex - 1, startIndex - 1), "translateY(".concat(len, "px)"));
      }
    }

    function transform(state, p, q, style) {
      for (let i = p; i <= q; i++) {
        if (state && !list[i].classList.contains(CLS_TRANSFORMED)) {
          list[i].classList.add(CLS_TRANSFORMED);
          list[i].style.transform = style;
        } else if (!state && list[i].classList.contains(CLS_TRANSFORMED)) {
          list[i].classList.remove(CLS_TRANSFORMED);
          list[i].style = '';
        }
      }
    }
  }
  function DraggableList(el, {
    bound,
    scrollContainer
  } = {}) {
    for (const c of el.children) {
      c.draggable = true;
    }

    new MutationObserver(records => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          n.draggable = true;
        }
      }
    }).observe(el, {
      childList: true
    });
    let startPos = null;
    let startIndex = 0;
    let dragOverIndex = 0;
    let dragOverPos = null;
    let rects = [];
    let dragTarget = null;
    let dropped = false;
    let itemSize = 0;
    el.addEventListener('dragstart', e => {
      if (e.target.parentNode !== el) return;
      dragTarget = e.target;
      dropped = false;
      const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
      startPos = {
        x: e.pageX + scrollLeft,
        y: e.pageY + scrollTop
      };
      startIndex = [...el.children].indexOf(e.target);
      dragOverIndex = startIndex;
      dragOverPos = startPos;
      rects = [...el.children].map(el => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top + window.scrollY + scrollTop,
          bottom: r.bottom + window.scrollY + scrollTop
        };
      });
      itemSize = startIndex + 1 < rects.length ? rects[startIndex + 1].top - rects[startIndex].top : startIndex > 0 ? rects[startIndex].bottom - rects[startIndex - 1].bottom : 0;
      dragTarget.classList.add('draggable-list-target');
      el.classList.add('draggable-list-dragging');
      dispatch(e, 'd:dragstart');
    });
    el.addEventListener('dragenter', e => {
      if (dragTarget) {
        e.preventDefault();
        dispatch(e, 'd:dragmove');
      }
    });
    el.addEventListener('dragover', e => {
      if (!dragTarget) return;
      e.preventDefault();
      const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
      const newPos = {
        x: e.pageX + scrollLeft,
        y: e.pageY + scrollTop
      };
      const newIndex = posToIndex(rects, startIndex, newPos.y, bound);
      applyTransform(el.children, startIndex, dragOverIndex, newIndex, itemSize);
      dragOverIndex = newIndex;
      dragOverPos = newPos;
      dispatch(e, 'd:dragmove');
    });
    document.addEventListener('dragend', e => {
      if (!dragTarget) return;

      for (const c of el.children) {
        c.classList.remove(CLS_TRANSFORMED);
        c.style = '';
      }

      dragTarget.classList.remove('draggable-list-target');
      el.classList.remove('draggable-list-dragging');
      dispatch(e, 'd:dragend', {
        originalIndex: startIndex,
        spliceIndex: dragOverIndex,
        insertBefore: dragOverIndex < startIndex ? el.children[dragOverIndex] : el.children[dragOverIndex + 1],
        dropped
      });
      dragTarget = null;
    });
    el.addEventListener('drop', e => {
      if (dragTarget) {
        dropped = true;
        e.preventDefault();
      }
    });

    function dispatch(e, name, props) {
      const detail = {
        origin: e,
        startPos,
        currentPos: dragOverPos,
        dragTarget
      };

      if (props) {
        Object.assign(detail, props);
      }

      el.dispatchEvent(new CustomEvent(name, {
        detail
      }));
    }
  }

  return DraggableList;

})();
