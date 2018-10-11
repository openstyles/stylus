/* eslint no-eq-null: 0, eqeqeq: [2, "smart"] */
/* global createCache db calcStyleDigest db tryRegExp
  getStyleWithNoCode msg */
/* exported styleManager */
'use strict';

/*
This style manager is a layer between content script and the DB. When a style
is added/updated, it broadcast a message to content script and the content
script would try to fetch the new code.

The live preview feature relies on `runtime.connect` and `port.onDisconnect`
to cleanup the temporary code. See /edit/live-preview.js.
*/
const styleManager = (() => {
  const preparing = prepare();
  const styles = new Map();
  const cachedStyleForUrl = createCache();
  const compiledRe = createCache();
  const compiledExclusion = createCache();
  const BAD_MATCHER = {test: () => false};

  handleLivePreviewConnections();

  return ensurePrepared({
    get,
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
    countStylesByUrl, // used by icon badge
  });

  function handleLivePreviewConnections() {
    chrome.runtime.onConnect.addListener(port => {
      if (port.name !== 'livePreview') {
        return;
      }
      let id;
      port.onMessage.addListener(data => {
        if (!id) {
          id = data.id;
        }
        const style = styles.get(id);
        style.preview = data;
        broadcastStyleUpdated(style.preview, 'editPreview');
      });
      port.onDisconnect.addListener(() => {
        port = null;
        if (id) {
          const style = styles.get(id);
          style.preview = null;
          broadcastStyleUpdated(style.data, 'editPreview');
        }
      });
    });
  }

  function get(id) {
    return styles.get(id).data;
  }

  function getAllStyles() {
    return [...styles.values()].map(s => s.data);
  }

  function toggleStyle(id, enabled) {
    const style = styles.get(id);
    const data = Object.assign({}, style.data, {enabled});
    return saveStyle(data)
      .then(newData => {
        style.data = newData;
        for (const url of style.appliesTo) {
          const cache = cachedStyleForUrl.get(url);
          if (cache) {
            cache.sections[newData.id].enabled = newData.enabled;
          }
        }
        const message = {
          method: 'styleUpdated',
          reason: 'toggle',
          codeIsUpdated: false,
          style: {id, enabled}
        };
        if ([...style.appliesTo].every(isExtensionUrl)) {
          return msg.broadcastExtension(message, 'both');
        }
        // FIXME: this won't work with iframes
        // return msg.broadcast(message, tab => style.appliesTo.has(tab.url));
        return msg.broadcast(message);
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
      .filter(s => !filter || filterMatch(filter, s.data))
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
      .filter(s => filterMatch(filter, s.data))
      .length;
  }

  function filterMatch(filter, target) {
    for (const key of Object.keys(filter)) {
      if (filter[key] !== target[key]) {
        return false;
      }
    }
    return true;
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
      .then(newData => handleSave(
        newData,
        style ? 'update' : 'install',
        style ? 'styleUpdated' : 'styleAdded'
      ));
  }

  function editSave(data) {
    const style = styles.get(data.id);
    if (style) {
      data = Object.assign({}, style.data, data);
    } else {
      data = Object.assign(createNewStyle(), data);
    }
    return saveStyle(data)
      .then(newData => handleSave(
        newData,
        'editSave',
        style ? 'styleUpdated' : 'styleAdded'
      ));
  }

  function setStyleExclusions(id, exclusions) {
    const data = Object.assign({}, styles.get(id).data, {exclusions});
    return saveStyle(data)
      .then(newData => handleSave(newData, 'exclusions', 'styleUpdated'));
  }

  function deleteStyle(id) {
    const style = styles.get(id);
    return db.exec('delete', id)
      .then(() => {
        for (const url of style.appliesTo) {
          const cache = cachedStyleForUrl.get(url);
          if (cache) {
            delete cache.sections[id];
          }
        }
        styles.delete(id);
        return msg.broadcast({
          method: 'styleDeleted',
          style: {id}
        });
      })
      .then(() => id);
  }

  function ensurePrepared(methods) {
    const prepared = {};
    for (const [name, fn] of Object.entries(methods)) {
      prepared[name] = (...args) =>
        preparing.then(() => fn(...args));
    }
    return prepared;
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

  function broadcastStyleUpdated(data, reason, method = 'styleUpdated') {
    const style = styles.get(data.id);
    const excluded = new Set();
    const updated = new Set();
    for (const [url, cache] of cachedStyleForUrl.entries()) {
      if (!style.appliesTo.has(url)) {
        cache.maybeMatch.add(data.id);
        continue;
      }
      const code = getAppliedCode(url, data);
      if (!code) {
        excluded.add(url);
        delete cache.sections[data.id];
      } else {
        updated.add(url);
        cache.sections[data.id] = {
          id: data.id,
          enabled: data.enabled,
          code
        };
      }
    }
    style.appliesTo = updated;
    return msg.broadcast({
      method,
      style: {
        id: data.id,
        enabled: data.enabled
      },
      reason
    });
  }

  // function importStyle(style) {
    // FIXME: move this to importer
    // style.originalDigest = style.originalDigest || style.styleDigest; // TODO: remove in the future
    // delete style.styleDigest; // TODO: remove in the future
    // if (typeof style.originalDigest !== 'string' || style.originalDigest.length !== 40) {
      // delete style.originalDigest;
    // }
  // }

  function saveStyle(style) {
    if (!style.name) {
      throw new Error('style name is empty');
    }
    if (style.id == null) {
      delete style.id;
    }
    return db.exec('put', style)
      .then(event => {
        if (style.id == null) {
          style.id = event.target.result;
        }
        return style;
      });
  }

  function handleSave(data, reason, method) {
    const style = styles.get(data.id);
    if (!style) {
      styles.set(data.id, {
        appliesTo: new Set(),
        data
      });
    } else {
      style.data = data;
    }
    return broadcastStyleUpdated(data, reason, method)
      .then(() => data);
  }

  function getStylesInfoByUrl(url) {
    const sections = getSectionsByUrl(url);
    return Object.keys(sections)
      .map(k => getStyleWithNoCode(styles.get(Number(k)).data));
  }

  function countStylesByUrl(url, filter) {
    const sections = getSectionsByUrl(url, filter);
    return Object.keys(sections).length;
  }

  function getSectionsByUrl(url, filter) {
    let cache = cachedStyleForUrl.get(url);
    if (!cache) {
      cache = {
        sections: {},
        maybeMatch: new Set()
      };
      buildCache(styles.values());
      cachedStyleForUrl.set(url, cache);
    } else if (cache.maybeMatch.size) {
      buildCache(
        [...cache.maybeMatch]
          .filter(i => styles.has(i))
          .map(i => styles.get(i))
      );
    }
    // if (filter && filter.id) {
      // if (!cache.sections[filter.id]) {
        // return {};
      // }
      // return {[filter.id]: cache.sections[filter.id]};
    // }
    if (filter) {
      return Object.values(cache.sections)
        .filter(s => filterMatch(filter, s))
        .reduce((o, v) => {
          o[v.id] = v;
          return o;
        }, {});
    }
    return cache.sections;

    function buildCache(styleList) {
      for (const {appliesTo, data, preview} of styleList) {
        const code = getAppliedCode(url, preview || data);
        if (code) {
          cache.sections[data.id] = {
            id: data.id,
            enabled: data.enabled,
            code
          };
          // FIXME: memory leak
          appliesTo.add(url);
        }
      }
    }
  }

  // TODO: report excluded styles and sloppy regexps?
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
    // TODO: show excluded style in popup?
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
    // as per spec the fragment portion is ignored in @-moz-document:
    // https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
    // but the spec is outdated and doesn't account for SPA sites
    // so we only respect it for `url()` function
    if (section.urls && (
      section.urls.includes(url) ||
      section.urls.includes(getUrlNoHash(url))
    )) {
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
    return url.match(/^[\w-]+:\/+(?:[\w:-]+@)?([^:/#]+)/)[1];
  }

  function getUrlNoHash(url) {
    return url.split('#')[0];
  }
})();
