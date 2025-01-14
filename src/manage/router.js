import {onMessage} from '@/js/msg';
import {deepEqual} from '@/js/util';

const buffer = history.state?.buffer || [];
const watchers = [];

export function getSearch(key) {
  return new URLSearchParams(location.search).get(key);
}

/** When showing the UI, `showHide` function must resolve only when the UI is closed */
export function makeToggle(toggler, hashId, showHide, loadDeps) {
  const hash = '#' + hashId;
  const selector = '.' + hashId;
  watch({hash}, async state => {
    const el = $(selector);
    if (!state === !el) return;
    if (state && loadDeps) showHide ??= await loadDeps();
    await showHide(state, el, selector, toggler);
    if (state) updateHash('');
  });
  for (const el of $$(toggler)) {
    el.on('click', () => {
      toggler = el;
      updateHash(hash);
    });
  }
}

export function push(url) {
  const state = history.state || {};
  state.buffer = buffer;
  history.pushState(state, null, url);
}

export function update() {
  if (!buffer.length) {
    buffer.push(location.href);
  } else if (buffer[buffer.length - 1] === location.href) {
    if (watchers.some(w => !w.init)) callWatchers();
    return;
  } else if (buffer.length > 1 && buffer[buffer.length - 2] === location.href) {
    buffer.pop();
  } else {
    buffer.push(location.href);
  }
  callWatchers();
}

function callWatchers() {
  for (const w of watchers) {
    const {options, callback} = w;
    w.init = true;
    let state;
    if (options.hash) {
      state = options.hash === location.hash;
    } else if (options.search) {
      const search = new URLSearchParams(location.search);
      state = options.search.map(key => search.get(key));
    }
    if (!deepEqual(state, options.currentState)) {
      options.currentState = state;
      callback(state);
    }
  }
}

/**
 * @param {string} hash - empty string removes the hash
 */
export function updateHash(hash) {
  if (buffer.length > 1) {
    if (!hash && !buffer[buffer.length - 2].includes('#') ||
        hash && buffer[buffer.length - 2].endsWith(hash)) {
      history.back();
      return;
    }
  }
  if (!hash) {
    hash = ' ';
  }
  push(hash);
  update();
}

/**
 * @param {Object|string} what - an object or a single key
 * @param {string} [value] - for `key` mode
 */
export function updateSearch(what, value) {
  const u = new URL(location);
  const entries = typeof what === 'object' ? Object.entries(what) : [[what, value]];
  for (const [key, val] of entries) {
    if (val) u.searchParams.set(key, val);
    else u.searchParams.delete(key);
  }
  history.replaceState(history.state, null, `${u}`);
  buffer.pop();
  update();
}

export function watch(options, callback) {
  /* Watch search params or hash and get notified on change.

   options: {search?: Array<key: String>, hash?: String}
   callback: (Array<value: String | null> | Boolean) => void

   `hash` should always start with '#'.
   When watching search params, callback receives a list of values.
   When watching hash, callback receives a boolean.
   */
  watchers.push({options, callback});
}

window.on('popstate', update);
window.on('hashchange', update);
onMessage.set(m => {
  if (m.method === 'pushState' && m.url !== location.href) {
    push(m.url);
    update();
  }
});
