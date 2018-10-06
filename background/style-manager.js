/* eslint no-eq-null: 0, eqeqeq: [2, "smart"] */
/*
  global createCache db calcStyleDigest normalizeStyleSections db promisify
  getStyleWithNoCode msg
*/
'use strict';

const styleManager = (() => {
  const preparing = prepare();
  const styles = new Map();
  const cachedStyleForUrl = createCache();
  const compiledRe = createCache();
  const compiledExclusion = createCache();
  const BAD_MATCHER = {test: () => false};

  // FIXME: do we have to prepare `styles` map for all methods?
  return ensurePrepared({
    // styles,
    // cachedStyleForUrl,
    getStylesInfo,
    getSectionsByUrl,
    installStyle,
    deleteStyle,
    setStyleExclusions,
    editSave,
    toggleStyle,
    getAllStyles, // used by import-export
    getStylesInfoByUrl, // used by popup
    countStyles,
    // TODO: get all styles API?
    // TODO: get style by ID?
  });

  function getAllStyles() {
    return [...styles.values()].map(s => s.data);
  }

  function toggleStyle(id, enabled) {
    const style = styles.get(id);
    const newData = Object.assign({}, style.data, {enabled});
    return saveStyle(newData)
      .then(newData => {
        style.data = newData;
        for (const url of style.appliesTo) {
          const cache = cachedStyleForUrl.get(url);
          if (cache) {
            cache[newData.id].enabled = newData.enabled;
          }
        }
        const message = {
          method: 'styleUpdated',
          codeIsUpdated: false,
          style: {id, enabled}
        };
        if ([...style.appliesTo].every(isExtensionUrl)) {
          return msg.broadcastExtension(message, 'both');
        }
        return msg.broadcast(message, tab => style.appliesTo.has(tab.url));
      })
      .then(() => id);
  }

  function isExtensionUrl(url) {
    return /^\w+?-extension:\/\//.test(url);
  }

  function getStylesInfo(filter) {
    if (filter && filter.id) {
      return [getStyleWithNoCode(styles.get(filter.id).data)];
    }
    return [...styles.values()]
      .filter(s => !filter || filterMatchStyle(filter, s.data))
      .map(s => getStyleWithNoCode(s.data));
  }

  function countStyles(filter) {
    if (!filter) {
      return styles.size;
    }
    if (filter.id) {
      return styles.has(filter.id) ? 1 : 0;
    }
    return [...styles.values()]
      .filter(s => filterMatchStyle(filter, s.data))
      .length;
  }

  function filterMatchStyle(filter, style) {
    for (const key of Object.keys(filter)) {
      if (filter[key] !== style[key]) {
        return false;
      }
    }
    return true;
  }

  function editSave(data) {
    data = Object.assign({}, styles.get(data.id).data, data);
    return saveStyle(data)
      .then(newData =>
        broadcastStyleUpdated(newData)
          .then(() => newData)
      );
  }

  function setStyleExclusions(id, exclusions) {
    const data = Object.assign({}, styles.get(id), {exclusions});
    return saveStyle(data)
      .then(newData =>
        broadcastStyleUpdated(newData)
          .then(() => newData)
      );
  }

  function ensurePrepared(methods) {
    for (const [name, fn] in Object.entries(methods)) {
      methods[name] = (...args) =>
        preparing.then(() => fn(...args));
    }
    return methods;
  }

  function deleteStyle(id) {
    const style = styles.get(id);
    return db.exec('delete', id)
      .then(() => {
        for (const url of style.appliesTo) {
          const cache = cachedStyleForUrl.get(url);
          if (cache) {
            delete cache[id];
          }
        }
        styles.delete(id);
        return msg.broadcast({
          method: 'styleDeleted',
          style: {id}
        }, tab => style.appliesTo.has(tab.url));
      })
      .then(() => id);
  }

  function createNewStyle() {
    return {
      enabled: true,
      updateUrl: null,
      md5Url: null,
      url: null,
      originalMd5: null,
      installDate: Date.now()
    };
  }

  function installStyle(data) {
    const style = styles.get(data.id);
    if (!style) {
      data = Object.assign(createNewStyle(), data);
    } else {
      data = Object.assign({}, style.data, data);
    }
    // FIXME: update installDate?
    return calcStyleDigest(data)
      .then(digest => {
        data.originalDigest = digest;
        return saveStyle(data);
      })
      .then(newData =>
        broadcastStyleUpdated(newData)
          .then(() => newData)
      );
  }

  function broadcastStyleUpdated(newData) {
    const style = styles.get(newData.id);
    if (!style) {
      // new style
      const appliesTo = new Set();
      styles.set(newData.id, {
        appliesTo,
        data: newData
      });
      return Promise.all([
        msg.broadcastExtension({method: 'styleAdded', style: getStyleWithNoCode(newData)}),
        msg.broadcastTab(tab => getStyleAddedMessage(tab, newData, appliesTo))
      ]);
    }
    const excluded = new Set();
    const updated = new Map();
    for (const url of style.appliesTo) {
      const code = getAppliedCode(url, newData);
      const cache = cachedStyleForUrl.get(url);
      if (!code) {
        excluded.add(url);
        if (cache) {
          delete cache[newData.id];
        }
      } else {
        updated.set(url, code);
        if (cache) {
          cache[newData.id] = {
            id: newData.id,
            enabled: newData.enabled,
            code
          };
        }
      }
    }
    style.appliesTo = new Set(updated.keys());
    return Promise.all([
      msg.broadcastExtension({method: 'styleUpdated', style: getStyleWithNoCode(newData)}),
      msg.broadcastTab(tab => {
        if (excluded.has(tab.url)) {
          return {
            method: 'styleDeleted',
            style: {id: newData.id}
          };
        }
        if (updated.has(tab.url)) {
          return {
            method: 'styleUpdated',
            style: {id: newData.id, sections: updated.get(tab.url)}
          };
        }
        return getStyleAddedMessage(tab, newData, style.appliesTo);
      })
    ]);
  }

  function getStyleAddedMessage(tab, data, appliesTo) {
    const code = getAppliedCode(tab.url, data);
    if (!code) {
      return;
    }
    const cache = cachedStyleForUrl.get(tab.url);
    if (cache) {
      cache[data.id] = {
        id: data.id,
        enabled: data.enabled,
        code
      };
    }
    appliesTo.add(tab.url);
    return {
      method: 'styleAdded',
      style: {
        id: data.id,
        enabled: data.enabled,
        sections: code
      }
    };
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
    if (!style.name) {
      throw new Error('style name is empty');
    }
    return db.exec('put', style)
      .then(event => {
        if (style.id == null) {
          style.id = event.target.result;
        }
        return style;
      });
  }

  function getStylesInfoByUrl(url) {
    const sections = getSectionsByUrl(url);
    return Object.keys(sections)
      .map(k => getStyleWithNoCode(styles.get(Number(k)).data));
  }

  function getSectionsByUrl(url, filter) {
    let cache = cachedStyleForUrl.get(url);
    if (!cache) {
      cache = {};
      for (const {appliesTo, data} of styles.values()) {
        const code = getAppliedCode(url, data);
        if (code) {
          cache[data.id] = {
            id: data.id,
            enabled: data.enabled,
            code
          };
          appliesTo.add(url);
        }
      }
      cachedStyleForUrl.set(url, cache);
    }
    if (filter && filter.id) {
      return {[filter.id]: cache[filter.id]};
    }
    if (filter) {
      return Object.values(cache)
        .filter(s => filterMatchStyle(filter, s))
        .reduce((o, v) => {
          o[v.id] = v;
          return o;
        }, {});
    }
    return cache;
  }

  function getAppliedCode(url, data) {
    if (!urlMatchStyle(url, data)) {
      return;
    }
    let code = '';
    for (const section of data.sections) {
      if (urlMatchSection(url, section)) {
        if (!isCodeEmpty(section.code)) {
          code += section.code;
        }
      }
    }
    return code;
  }

  function isCodeEmpty(code) {
    const rx = /\s+|\/\*[\s\S]*?\*\/|@namespace[^;]+;|@charset[^;]+;/giy;
    while (rx.exec(code)) {
      if (rx.lastIndex === code.length) {
        return true;
      }
    }
    return false;
  }

  function prepare() {
    return db.exec('getAll').then(event => {
      const styleList = event.target.result;
      if (!styleList) {
        return;
      }
      for (const style of styleList) {
        styles.set(style.id, {
          appliesTo: new Set(),
          data: style
        });
        if (!style.name) {
          style.name = 'ID: ' + style.id;
        }
      }
    });
  }

  function urlMatchStyle(url, style) {
    if (style.exclusions && style.exclusions.some(e => compileExclusion(e).test(url))) {
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
    if (
      (!section.regexps || !section.regexps.length) &&
      (!section.urlPrefixes || !section.urlPrefixes.length) &&
      (!section.urls || !section.urls.length) &&
      (!section.domains || !section.domains.length)
    ) {
      return true;
    }
    return false;
  }

  function compileRe(text) {
    let re = compiledRe.get(text);
    if (!re) {
      re = tryRegExp(`^(${text})$`);
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
    return url.match(/^[\w-]+:\/\/(?:[\w:-]+@)?([^:/#]+)/)[1];
  }

  function getUrlNoHash(url) {
    return url.split('#')[0];
  }
})();

function notifyAllTabs() {}
