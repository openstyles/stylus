/* global deepEqual */
/* exported router */
'use strict';

const router = (() => {
  // FIXME: this only works with one history
  const buffer = [];
  const watchers = [];
  document.addEventListener('DOMContentLoaded', () => update());
  window.addEventListener('popstate', () => update());
  window.addEventListener('hashchange', () => update());
  return {watch, updateSearch, getSearch, updateHash};

  function watch(options, callback) {
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
    if (buffer.length > 1) {
      if (!hash && !buffer[buffer.length - 2].includes('#') || buffer[buffer.length - 2].endsWith(hash)) {
        buffer.pop();
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
    if (!buffer.length || buffer[buffer.length - 1] !== location.href && !replace) {
      buffer.push(location.href);
    } else if (buffer.length && replace) {
      buffer[buffer.length - 1] = location.href;
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
