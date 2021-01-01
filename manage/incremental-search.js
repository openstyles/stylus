/* global debounce */// toolbox.js
/* global installed */// manage.js
/* global
  $
  $create
  $isTextInput
  animateElement
  scrollElementIntoView
*/// dom.js
'use strict';

(() => {
  let prevText, focusedLink, focusedEntry;
  let prevTime = performance.now();
  let focusedName = '';
  const input = $create('textarea', {
    spellcheck: false,
    attributes: {tabindex: -1},
    oninput: incrementalSearch,
  });
  replaceInlineStyle({
    opacity: '0',
    position: 'absolute',
    color: 'transparent',
    border: '1px solid hsla(180, 100%, 100%, .5)',
    margin: '-1px -2px',
    overflow: 'hidden',
    resize: 'none',
    'background-color': 'hsla(180, 100%, 100%, .2)',
    'box-sizing': 'content-box',
    'pointer-events': 'none',
  });
  document.body.appendChild(input);
  window.on('keydown', maybeRefocus, true);

  function incrementalSearch({key}, immediately) {
    if (!immediately) {
      debounce(incrementalSearch, 100, {}, true);
      return;
    }
    const direction = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    const text = input.value.toLocaleLowerCase();
    if (!text.trim() || !direction && (text === prevText || focusedName.startsWith(text))) {
      prevText = text;
      return;
    }
    let textAtPos = 1e6;
    let rotated;
    const entries = [...installed.children];
    const focusedIndex = entries.indexOf(focusedEntry);
    if (focusedIndex > 0) {
      if (direction > 0) {
        rotated = entries.slice(focusedIndex + 1).concat(entries.slice(0, focusedIndex + 1));
      } else if (direction < 0) {
        rotated = entries.slice(0, focusedIndex).reverse()
          .concat(entries.slice(focusedIndex).reverse());
      }
    }
    let found;
    for (const entry of rotated || entries) {
      if (entry.classList.contains('hidden')) continue;
      const name = entry.styleNameLowerCase;
      const pos = name.indexOf(text);
      if (pos === 0) {
        found = entry;
        break;
      } else if (pos > 0 && (pos < textAtPos || direction)) {
        found = entry;
        textAtPos = pos;
        if (direction) {
          break;
        }
      }
    }
    if (found && found !== focusedEntry) {
      focusedEntry = found;
      focusedLink = $('.style-name-link', found);
      focusedName = found.styleNameLowerCase;
      scrollElementIntoView(found, {invalidMarginRatio: .25});
      animateElement(found, 'highlight-quick');
      replaceInlineStyle({
        width: focusedLink.offsetWidth + 'px',
        height: focusedLink.offsetHeight + 'px',
        opacity: '1',
      });
      focusedLink.prepend(input);
      return true;
    }
  }

  function maybeRefocus(event) {
    if (event.altKey || event.metaKey || $('#message-box')) {
      return;
    }
    const inTextInput = $isTextInput(event.target);
    const {key, code, ctrlKey: ctrl} = event;
    // `code` is independent of the current keyboard language
    if ((code === 'KeyF' && ctrl && !event.shiftKey) ||
        (code === 'Slash' || key === '/') && !ctrl && !inTextInput) {
      // focus search field on "/" or Ctrl-F key
      event.preventDefault();
      $('#search').focus();
      return;
    }
    if (ctrl || inTextInput && event.target !== input) {
      return;
    }
    const time = performance.now();
    if (key.length === 1) {
      if (time - prevTime > 1000) {
        input.value = '';
      }
      // Space or Shift-Space is for page down/up
      if (key === ' ' && !input.value) {
        input.blur();
      } else {
        input.focus();
        prevTime = time;
      }
    } else
    if (key === 'Enter' && focusedLink) {
      focusedLink.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    } else
    if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey &&
        time - prevTime < 5000 && incrementalSearch(event, true)) {
      prevTime = time;
    } else
    if (event.target === input) {
      (focusedLink || document.body).focus();
      input.value = '';
    }
  }

  function replaceInlineStyle(css) {
    for (const prop in css) {
      input.style.setProperty(prop, css[prop], 'important');
    }
  }
})();
