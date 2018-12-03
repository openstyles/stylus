/* global UI $$ updateInjectionOrder */
'use strict';

// Polyfill for mobile? - https://caniuse.com/#feat=dragndrop
(() => {
  let dragged = null;

  function cleanup() {
    $$('.entry.dragging').forEach(el => {
      el.classList.remove('dragging');
    });
    $('body').classList.remove('dragging');
    updateInjectionOrder();
  }

  document.addEventListener('dragstart', event => {
    const el = event.target.closest('.entry');
    if (el) {
      dragged = el;
      el.classList.add('dragging');
      $('body').classList.add('dragging');
    }
  }, false);

  document.addEventListener('dragend', () => {
    cleanup();
  });

  document.addEventListener('dragenter', event => {
    const el = event.target.closest('.entry, .entry-header');
    if (el && dragged) {
      // Insert after the target; keeps header at top
      el.after(dragged);
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
