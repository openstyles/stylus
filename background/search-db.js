/* global API_METHODS styleManager tryRegExp debounce */
'use strict';

(() => {
  // toLocaleLowerCase cache, autocleared after 1 minute
  const cache = new Map();

  // Creates an array of intermediate words (2 letter minimum)
  // 'usercss' => ["us", "use", "user", "userc", "usercs", "usercss"]
  // this makes it so the user can type partial queries and not have the search
  // constantly switching between using & ignoring the filter
  const createPartials = id => id.split('').reduce((acc, _, index) => {
    if (index > 0) {
      acc.push(id.substring(0, index + 1));
    }
    return acc;
  }, []);

  const searchWithin = [{
    id: 'code',
    labels: createPartials('code'),
    get: style => style.sections.map(section => section.code).join(' ')
  }, {
    id: 'usercss',
    labels: [...createPartials('usercss'), ...createPartials('meta')],
    get: style => JSON.stringify(style.usercssData || {})
      // remove JSON structure; restore urls
      .replace(/[[\]{},":]/g, ' ').replace(/\s\/\//g, '://')
  }, {
    id: 'name', // default
    labels: createPartials('name'),
    get: style => style.name
  }];

  const styleProps = [{
    id: 'enabled',
    labels: ['on', ...createPartials('enabled')],
    check: style => style.enabled
  }, {
    id: 'disabled',
    labels: ['off', ...createPartials('disabled')],
    check: style => !style.enabled
  }, {
    id: 'local',
    labels: createPartials('local'),
    check: style => !style.updateUrl
  }, {
    id: 'external',
    labels: createPartials('external'),
    check: style => style.updateUrl
  }, {
    id: 'usercss',
    labels: createPartials('usercss'),
    check: style => style.usercssData
  }, {
    id: 'non usercss',
    labels: ['original', ...createPartials('nonusercss')],
    check: style => !style.usercssData
  }];

  const matchers = [{
    id: 'url',
    test: query => /url:\w+/i.test(query),
    matches: query => {
      const matchUrl = query.match(/url:([/.-_\w]+)/);
      const result = matchUrl && matchUrl[1]
        ? styleManager.getStylesByUrl(matchUrl[1])
          .then(result => result.map(r => r.data.id))
        : [];
      return {result};
    },
  }, {
    id: 'regex',
    test: query => {
      const x = query.includes('/') && !query.includes('//') &&
        /^\/(.+?)\/([gimsuy]*)$/.test(query);
      // console.log('regex match?', query, x);
      return x;
    },
    matches: () => ({regex: tryRegExp(RegExp.$1, RegExp.$2)})
  }, {
    id: 'props',
    test: query => /is:/.test(query),
    matches: query => {
      const label = /is:(\w+)/g.exec(query);
      return label && label[1]
        ? {prop: styleProps.find(p => p.labels.includes(label[1]))}
        : {};
    }
  }, {
    id: 'within',
    test: query => /in:/.test(query),
    matches: query => {
      const label = /in:(\w+)/g.exec(query);
      return label && label[1]
        ? {within: searchWithin.find(s => s.labels.includes(label[1]))}
        : {};
    }
  }, {
    id: 'default',
    test: () => true,
    matches: query => {
      const word = query.startsWith('"') && query.endsWith('"')
        ? query.slice(1, -1)
        : query;
      return {word: word || query};
    }
  }];

  /**
   * @param params
   * @param {string} params.query - 1. url:someurl 2. text (may contain quoted parts like "qUot Ed")
   * @param {number[]} [params.ids] - if not specified, all styles are searched
   * @returns {number[]} - array of matched styles ids
   */
  API_METHODS.searchDB = ({query, ids}) => {
    const parts = query.trim().split(/(".*?")|\s+/).filter(Boolean);

    const searchFilters = {
      words: [],
      regex: null, // only last regex expression is used
      results: [],
      props: [],
      within: [],
    };

    const searchText = (text, searchFilters) => {
      if (searchFilters.regex) return searchFilters.regex.test(text);
      for (let pass = 1; pass <= (searchFilters.icase ? 2 : 1); pass++) {
        if (searchFilters.words.every(w => text.includes(w))) return true;
        text = lower(text);
      }
    };

    const searchProps = (style, searchFilters) => {
      const x = searchFilters.props.every(prop => {
        const y = prop.check(style)
        // if (y) console.log('found prop', prop.id, style.id)
        return y;
      });
      // if (x) console.log('found prop', style.id)
      return x;
    };

    parts.forEach(part => {
      matchers.some(matcher => {
        if (matcher.test(part)) {
          const {result, regex, word, prop, within} = matcher.matches(part || '');
          if (result) searchFilters.results.push(result);
          if (regex) searchFilters.regex = regex; // limited to a single regexp
          if (word) searchFilters.words.push(word);
          if (prop) searchFilters.props.push(prop);
          if (within) searchFilters.within.push(within);
          return true;
        }
      });
    });
    if (!searchFilters.within.length) {
      searchFilters.within.push(...searchWithin.slice(-1));
    }

    // console.log('matchers', searchFilters);
    // url matches
    if (searchFilters.results.length) {
      return searchFilters.results;
    }
    searchFilters.icase = searchFilters.words.some(w => w === lower(w));
    query = parts.join(' ').trim();

    return styleManager.getAllStyles().then(styles => {
      if (ids) {
        const idSet = new Set(ids);
        styles = styles.filter(s => idSet.has(s.id));
      }

      const results = [];
      const propResults = [];
      const hasProps = searchFilters.props.length > 0;
      const noWords = searchFilters.words.length === 0;
      for (const style of styles) {
        const id = style.id;
        if (noWords) {
          // no query or only filters are matching -> show all styles
          results.push(id);
        } else {
          const text = searchFilters.within.map(within => within.get(style)).join(' ');
          if (searchText(text, searchFilters)) {
            results.push(id);
          }
        }
        if (hasProps && searchProps(style, searchFilters) && results.includes(id)) {
          propResults.push(id);
        }
      }
      // results AND propResults
      const finalResults = hasProps
        ? propResults.filter(id => results.includes(id))
        : results;
      if (cache.size) debounce(clearCache, 60e3);
      // console.log('final', finalResults)
      return finalResults;
    });
  };

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
