const styleManager = (() => {
  const preparing = prepare();
  const styles = new Map;
  const cachedStyleForUrl = createCache();
  const compiledRe = createCache();
  const compiledExclusion = createCache();
  const BAD_MATCHER = {test: () => false};

  // FIXME: do we have to prepare `styles` map for all methods?
  return ensurePrepared({
    getSectionsForURL,
    installStyle,
    deleteStyle,
    setStyleExclusions,
    editSave
    // TODO: get all styles API?
    // TODO: get style by ID?
  });

  function editSave() {}

  function setStyleExclusions() {}

  function ensurePrepared(methods) {
    for (const [name, fn] in Object.entries(methods)) {
      methods[name] = (...args) =>
        preparing.then(() => fn(...args));
    }
    return methods;
  }

  function deleteStyle(id) {
    return db.exec('delete', id)
      .then(() => {
        // FIXME: do we really need to clear the entire cache?
        cachedStyleForUrl.clear();
        notifyAllTabs({method: 'styleDeleted', id});
        return id;
      });
  }

  function installStyle(style) {
    return calcStyleDigest(style)
      .then(digest => {
        style.originalDigest = digest;
        return saveStyle(style);
      })
      .then(style => {
        // FIXME: do we really need to clear the entire cache?
        cachedStyleForUrl.clear();
        // FIXME: invalid signature
        notifyAllTabs();
      });
  }

  function importStyle(style) {
    // FIXME: move this to importer
    // style.originalDigest = style.originalDigest || style.styleDigest; // TODO: remove in the future
    // delete style.styleDigest; // TODO: remove in the future
    // if (typeof style.originalDigest !== 'string' || style.originalDigest.length !== 40) {
      // delete style.originalDigest;
    // }
  }

  function saveStyle(style) {
    return (style.id == null ? getNewStyle() : getOldStyle())
      .then(oldStyle => {
        // FIXME: update installDate?
        style = Object.assign(oldStyle, style);
        style.sections = normalizeStyleSections(style);
        return dbExec('put', style);
      })
      .then(event => {
        if (style.id == null) {
          style.id = event.target.result;
        }
        return style;
      });

    function getOldStyle() {
      return db.exec('get', style.id)
        .then((event, store) => {
          if (!event.target.result) {
            throw new Error(`Unknown style id: ${style.id}`);
          }
          return event.target.result;
        });
    }

    // FIXME: don't overwrite style name when the name is empty

    function getNewStyle() {
      return Promise.resolve({
        enabled: true,
        updateUrl: null,
        md5Url: null,
        url: null,
        originalMd5: null,
        installDate: Date.now()
      });
    }
  }

  function getSectionsForURL(url) {
    // if (!URLS.supported(url) || prefs.get('disableAll')) {
      // return [];
    // }
    let result = cachedStyleForUrl.get(url);
    if (!result) {
      result = [];
      for (const style of styles) {
        if (!urlMatchStyle(url, style)) {
          continue;
        }
        const item = {
          id: style.id,
          code: ''
        };
        for (const section of style.sections) {
          if (urlMatchSection(url, section)) {
            item.code += section.code;
          }
        }
        if (item.code) {
          result.push(item);
        }
      }
    }
    return result;
  }

  function prepare() {
    return db.exec('getAll').then(event => {
      const styleList = event.target.result || [];
      for (const style of styleList) {
        styles.set(style.id, style);
        if (!style.name) {
          style.name = 'ID: ' + style.id;
        }
      }
    });
  }

  function urlMatchStyle(url, style) {
    if (style.exclusions && style.exclusions.some(e => compileExclusion(e).test(url)) {
      return false;
    }
    return true;
  }

  function urlMatchSection(url, section) {
    // FIXME: match sub domains?
    if (section.domains && section.domains.includes(getDomain(url))) {
      return true;
    }
    if (section.urlPrefixes && section.urlPrefixes.some(p => url.startsWith(p))) {
      return true;
    }
    if (section.urls && section.urls.includes(getUrlNoHash(url))) {
      return true;
    }
    if (section.regexps && section.regexps.some(r => compileRe(r).test(url))) {
      return true;
    }
    return false;
  }

  function compileRe(text) {
    let re = compiledRe.get(text);
    if (!re) {
      // FIXME: it should be `$({text})$` but we don't use the standard for compatibility
      re = tryRegExp(`^${text}$`);
      if (!re) {
        re = BAD_MATCHER;
      }
      compiledRe.set(text, re);
    }
    return re;
  }

  function compileExclusion(text) {
    let re = compiledExclusion.get(text);
    if (!re) {
      re = tryRegExp(buildGlob(text));
      if (!re) {
        re = BAD_MATCHER;
      }
      compiledExclusion.set(text, re);
    }
    return re;
  }

  function buildGlob(text) {
    const prefix = text[0] === '^' ? '' : '\\b';
    const suffix = text[text.length - 1] === '$' ? '' : '\\b';
    return `${prefix}${escape(text)}${suffix}`;

    function escape(text) {
      // FIXME: using .* everywhere is slow
      return text.replace(/[.*]/g, m => m === '.' ? '\\.' : '.*');
    }
  }

  function getDomain(url) {
    // FIXME: use a naive regexp
    return url.match(/\w+:\/\//);
  }

  function getUrlNoHash(url) {
    return url.split('#')[0];
  }
})();
