/* global API_METHODS styleManager tryRegExp debounce */
'use strict';

(() => {
  // toLocaleLowerCase cache, autocleared after 1 minute
  const cache = new Map();
  // top-level style properties to be searched
  const PARTS = {
    name: searchText,
    url: searchText,
    sourceCode: searchText,
    sections: searchSections,
  };

  /**
   * @param params
   * @param {string} params.query - 1. url:someurl 2. text (may contain quoted parts like "qUot Ed")
   * @param {number[]} [params.ids] - if not specified, all styles are searched
   * @returns {number[]} - array of matched styles ids
   */
  API_METHODS.searchDB = ({query, ids}) => {
    let rx, words, icase, matchUrl;
    query = query.trim();

    if (/^url:/i.test(query)) {
      matchUrl = query.slice(query.indexOf(':') + 1).trim();
      if (matchUrl) {
        return styleManager.getStylesByUrl(matchUrl)
          .then(results => results.map(r => r.data.id));
      }
    }
    if (query.startsWith('/') && /^\/(.+?)\/([gimsuy]*)$/.test(query)) {
      rx = tryRegExp(RegExp.$1, RegExp.$2);
    }
    if (!rx) {
      words = query
        .split(/(".*?")|\s+/)
        .filter(Boolean)
        .map(w => w.startsWith('"') && w.endsWith('"')
          ? w.slice(1, -1)
          : w)
        .filter(w => w.length > 1);
      words = words.length ? words : [query];
      icase = words.some(w => w === lower(w));
    }

    return styleManager.getAllStyles().then(styles => {
      if (ids) {
        const idSet = new Set(ids);
        styles = styles.filter(s => idSet.has(s.id));
      }
      const results = [];
      for (const style of styles) {
        const id = style.id;
        if (!query || words && !words.length) {
          results.push(id);
          continue;
        }
        for (const part in PARTS) {
          const text = style[part];
          if (text && PARTS[part](text, rx, words, icase)) {
            results.push(id);
            break;
          }
        }
      }
      if (cache.size) debounce(clearCache, 60e3);
      return results;
    });
  };

  function searchText(text, rx, words, icase) {
    if (rx) return rx.test(text);
    for (let pass = 1; pass <= (icase ? 2 : 1); pass++) {
      if (words.every(w => text.includes(w))) return true;
      text = lower(text);
    }
  }

  function searchSections(sections, rx, words, icase) {
    for (const section of sections) {
      for (const prop in section) {
        const value = section[prop];
        if (typeof value === 'string') {
          if (searchText(value, rx, words, icase)) return true;
        } else if (Array.isArray(value)) {
          if (value.some(str => searchText(str, rx, words, icase))) return true;
        }
      }
    }
  }

  function lower(text) {
    let result = cache.get(text);
    if (result) return result;
    result = text.toLocaleLowerCase();
    cache.set(text, result);
    return result;
  }

  function clearCache() {
    cache.clear();
  }
})();
