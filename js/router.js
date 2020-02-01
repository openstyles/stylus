/* global deepEqual msg */
/* exported router */
'use strict';

const router = (() => {
  const buffer = [];
  const watchers = [];
  document.addEventListener('DOMContentLoaded', () => update());
  window.addEventListener('popstate', () => update());
  window.addEventListener('hashchange', () => update());
  msg.on(e => {
    if (e.method === 'pushState' && e.url !== location.href) {
      history.pushState(history.state, null, e.url);
      update();
      return true;
    }
  });
  return {watch, updateSearch, getSearch, updateHash};

  function watch(options, callback) {
    /* Watch search params or hash and get notified on change.

    options: {search?: Array<key: String>, hash?: String}
    callback: (Array<value: String | null> | Boolean) => void

    `hash` should always start with '#'.
    When watching search params, callback receives a list of values.
    When watching hash, callback receives a boolean.
    */
    watchers.push({options, callback});
  }

  function updateSearch(key, value) {
    const search = new URLSearchParams(location.search.replace(/^\?/, ''));
    if (!value) {
      search.delete(key);
    } else {
      search.set(key, value);
    }
    const finalSearch = search.toString();
    if (finalSearch) {
      history.replaceState(history.state, null, `?${finalSearch}${location.hash}`);
    } else {
      history.replaceState(history.state, null, `${location.pathname}${location.hash}`);
    }
    update(true);
  }

  function updateHash(hash) {
    /* hash: String

    Send an empty string to remove the hash.
    */
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
    update();
  }

  function getSearch(key) {
    return new URLSearchParams(location.search.replace(/^\?/, '')).get(key);
  }

  function update(replace) {
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
    for (const {options, callback} of watchers) {
      let state;
      if (options.hash) {
        state = options.hash === location.hash;
      } else if (options.search) {
        // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
        const search = new URLSearchParams(location.search.replace(/^\?/, ''));
        state = options.search.map(key => search.get(key));
      }
      if (!deepEqual(state, options.currentState)) {
        options.currentState = state;
        callback(state);
      }
    }
  }
})();
