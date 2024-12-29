import {$create, $isTextInput} from '@/js/dom';
import {animateElement, scrollElementIntoView} from '@/js/dom-util';
import {debounce} from '@/js/util';
import {installed} from './util';

let prevText, focusedLink, focusedEntry;
let prevTime = performance.now();
let focusedName = '';
const input = $create('textarea', {
  id: 'incremental-search',
  spellcheck: false,
  tabIndex: -1,
  oninput: incrementalSearch,
});
replaceInlineStyle({
  opacity: '0',
});
document.body.appendChild(input);
window.on('keydown', maybeRefocus, true);

function incrementalSearch(event, immediately) {
  const {key} = event;
  if (!immediately) {
    debounce(incrementalSearch, 100, {}, true);
    return;
  }
  const direction = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  const text = input.value.toLocaleLowerCase();
  if (direction) {
    event.preventDefault();
  }
  if (!text.trim() || !direction && (text === prevText || focusedName.startsWith(text))) {
    prevText = text;
    return;
  }
  let textAtPos = 1e6;
  let rotated;
  const entries = [...$id('message-box') ? $$('.injection-order-entry') : installed.children];
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
    const name = entry.styleNameLC;
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
    focusedLink = found.$('a');
    focusedName = found.styleNameLC;
    scrollElementIntoView(found, {invalidMarginRatio: .25});
    animateElement(found, 'highlight-quick');
    replaceInlineStyle({
      width: focusedLink.offsetWidth + 'px',
      height: focusedLink.offsetHeight + 'px',
      opacity: '1',
    });
    focusedLink.prepend(input);
    input.focus();
    return true;
  }
}

function maybeRefocus(event) {
  if (event.altKey || event.metaKey) {
    return;
  }
  const modal = $id('message-box');
  if (modal && !modal.classList.contains('injection-order')) {
    return;
  }
  const inTextInput = $isTextInput(event.target);
  const {key, code, ctrlKey: ctrl} = event;
  // `code` is independent of the current keyboard language
  if ((code === 'KeyF' && ctrl && !event.shiftKey) ||
      (code === 'Slash' || key === '/') && !ctrl && !inTextInput) {
    // focus search field on "/" or Ctrl-F key
    event.preventDefault();
    if (!modal) $id('search').focus();
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
  } else if (key === 'Enter' && focusedLink) {
    focusedLink.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  } else if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey &&
      time - prevTime < 5000 && incrementalSearch(event, true)) {
    prevTime = time;
  } else if (event.target === input) {
    (focusedLink || document.body).focus();
    input.value = '';
  }
}

function replaceInlineStyle(css) {
  for (const prop in css) {
    input.style.setProperty(prop, css[prop], 'important');
  }
}
