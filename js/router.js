/* global deepEqual */// toolbox.js
/* global msg */
'use strict';

const router = {
  buffer: [],
  watchers: [],

  getSearch(key) {
    return new URLSearchParams(location.search).get(key);
  },

  update(replace) {
    const {buffer} = router;
    if (!buffer.length) {
      buffer.push(location.href);
    } else if (buffer[buffer.length - 1] === location.href) {
      return;
    } else if (replace) {
      buffer[buffer.length - 1] = location.href;
    } else if (buffer.length > 1 && buffer[buffer.length - 2] === location.href) {
      buffer.pop();
    } else {
      buffer.push(location.href);
    }
    for (const {options, callback} of router.watchers) {
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
  },

  /**
   * @param {string} hash - empty string removes the hash
   */
  updateHash(hash) {
    const {buffer} = router;
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
    history.pushState(history.state, null, hash);
    router.update();
  },

  updateSearch(key, value) {
    const u = new URL(location);
    u.searchParams[value ? 'set' : 'delete'](key, value);
    history.replaceState(history.state, null, `${u}`);
    router.update(true);
  },

  watch(options, callback) {
    /* Watch search params or hash and get notified on change.

     options: {search?: Array<key: String>, hash?: String}
     callback: (Array<value: String | null> | Boolean) => void

     `hash` should always start with '#'.
     When watching search params, callback receives a list of values.
     When watching hash, callback receives a boolean.
     */
    router.watchers.push({options, callback});
  },
};

document.on('DOMContentLoaded', () => router.update());
window.on('popstate', () => router.update());
window.on('hashchange', () => router.update());
msg.on(e => {
  if (e.method === 'pushState' && e.url !== location.href) {
    history.pushState(history.state, null, e.url);
    router.update();
    return true;
  }
});
