import {onMessage} from '@/js/msg';

const buffer = history.state?.buffer || [];
const watchers = [];
let needInit;

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
  const len = buffer.length;
  const url = location.href;
  if (!len) {
    buffer.push(url);
  } else if (buffer[len - 1] === url) {
    if (!needInit)
      return;
  } else if (len > 1 && buffer[len - 2] === url) {
    buffer.pop();
  } else {
    buffer.push(url);
  }
  callWatchers();
}

function callWatchers() {
  for (const [options, callback] of watchers) {
    let state, serialized;
    const {hash, search} = options;
    if (hash) {
      state = hash === location.hash;
      serialized = state;
    } else if (search) {
      state = new URLSearchParams(location.search);
      state = search.map(state.get, state);
      serialized = JSON.stringify(state);
    }
    if (options.state !== serialized) {
      options.state = serialized;
      callback(state);
    }
  }
  needInit = false;
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
  const usp = u.searchParams;
  if (typeof what === 'object') {
    for (const key in what)
      if ((value = what[key])) usp.set(key, value);
      else usp.delete(key);
  } else if (value) usp.set(what, value);
  else usp.delete(what);
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
  watchers.push([options, callback]);
  needInit = true;
}

window.on('popstate', update);
window.on('hashchange', update);
onMessage.set(m => {
  if (m.method === 'pushState' && m.url !== location.href) {
    push(m.url);
    update();
  }
});
