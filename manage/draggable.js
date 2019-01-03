/* global $$ installed updateInjectionOrder */
'use strict';

// Polyfill for mobile? - https://caniuse.com/#feat=dragndrop
(() => {
  let dragged = null;

  function isEnabled() {
    return installed.dataset.sort === 'order';
  }

  function cleanup() {
    $$('.entry.dragging').forEach(el => {
      el.classList.remove('dragging');
    });
    if (isEnabled() && $('body').classList.contains('dragging')) {
      updateInjectionOrder();
    }
    $('body').classList.remove('dragging');
  }

  document.addEventListener('dragstart', event => {
    if (isEnabled()) {
      const el = event.target && event.target.closest('.entry');
      if (el) {
        dragged = el;
        el.classList.add('dragging');
        $('body').classList.add('dragging');
      }
    } else {
      cleanup();
      return false;
    }
  }, false);

  document.addEventListener('dragend', () => {
    cleanup();
  });

  document.addEventListener('dragenter', event => {
    if (isEnabled()) {
      const el = event.target && event.target.closest('.entry, .entry-header');
      if (el && dragged) {
        // Insert after the target; keeps header at top
        el.after(dragged);
      }
    }
  }, false);

  document.addEventListener('drop', event => {
    event.preventDefault();
    cleanup();
    if (dragged) {
      dragged = null;
    }
  }, false);

})();
