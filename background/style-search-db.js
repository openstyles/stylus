/* global API */// msg.js
/* global RX_META debounce stringAsRegExp tryRegExp */// toolbox.js
/* global addAPI */// common.js
'use strict';

(() => {
  // toLocaleLowerCase cache, autocleared after 1 minute
  const cache = new Map();
  const METAKEYS = ['customName', 'name', 'url', 'installationUrl', 'updateUrl'];

  const extractMeta = style =>
    style.usercssData
      ? (style.sourceCode.match(RX_META) || [''])[0]
      : null;

  const stripMeta = style =>
    style.usercssData
      ? style.sourceCode.replace(RX_META, '')
      : null;

  const MODES = Object.assign(Object.create(null), {
    code: (style, test) =>
      style.usercssData
        ? test(stripMeta(style))
        : searchSections(style, test, 'code'),

    meta: (style, test, part) =>
      METAKEYS.some(key => test(style[key])) ||
      test(part === 'all' ? style.sourceCode : extractMeta(style)) ||
      searchSections(style, test, 'funcs'),

    name: (style, test) =>
      test(style.customName) ||
      test(style.name),

    all: (style, test) =>
      MODES.meta(style, test, 'all') ||
      !style.usercssData && MODES.code(style, test),
  });

  addAPI(/** @namespace API */ {
    styles: {
      /**
       * @param params
       * @param {string} params.query - 1. url:someurl 2. text (may contain quoted parts like "qUot Ed")
       * @param {'name'|'meta'|'code'|'all'|'url'} [params.mode=all]
       * @param {number[]} [params.ids] - if not specified, all styles are searched
       * @returns {number[]} - array of matched styles ids
       */
      async searchDB({query, mode = 'all', ids}) {
        let res = [];
        if (mode === 'url' && query) {
          res = (await API.styles.getByUrl(query)).map(r => r.style.id);
        } else if (mode in MODES) {
          const modeHandler = MODES[mode];
          const m = /^\/(.+?)\/([gimsuy]*)$/.exec(query);
          const rx = m && tryRegExp(m[1], m[2]);
          const test = rx ? rx.test.bind(rx) : createTester(query);
          res = (await API.styles.getAll())
            .filter(style =>
              (!ids || ids.includes(style.id)) &&
              (!query || modeHandler(style, test)))
            .map(style => style.id);
          if (cache.size) debounce(clearCache, 60e3);
        }
        return res;
      },
    },
  });

  function createTester(query) {
    const flags = `u${lower(query) === query ? 'i' : ''}`;
    const words = query
      .split(/(".*?")|\s+/)
      .filter(Boolean)
      .map(w => w.startsWith('"') && w.endsWith('"')
        ? w.slice(1, -1)
        : w)
      .filter(w => w.length > 1);
    const rxs = (words.length ? words : [query])
      .map(w => stringAsRegExp(w, flags));
    return text => rxs.every(rx => rx.test(text));
  }

  function searchSections({sections}, test, part) {
    const inCode = part === 'code' || part === 'all';
    const inFuncs = part === 'funcs' || part === 'all';
    for (const section of sections) {
      for (const prop in section) {
        const value = section[prop];
        if (inCode && prop === 'code' && test(value) ||
            inFuncs && Array.isArray(value) && value.some(str => test(str))) {
          return true;
        }
      }
    }
  }

  function lower(text) {
    let result = cache.get(text);
    if (!result) cache.set(text, result = text.toLocaleLowerCase());
    return result;
  }

  function clearCache() {
    cache.clear();
  }
})();
