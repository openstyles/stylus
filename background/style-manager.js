/* global API msg */// msg.js
/* global CHROME URLS deepEqual isEmptyObj mapObj stringAsRegExp tryRegExp tryURL */// toolbox.js
/* global bgReady createCache uuidIndex */// common.js
/* global calcStyleDigest styleCodeEmpty styleSectionGlobal */// sections-util.js
/* global db */
/* global prefs */
/* global tabMan */
/* global usercssMan */
/* global colorScheme */
'use strict';

/*
This style manager is a layer between content script and the DB. When a style
is added/updated, it broadcast a message to content script and the content
script would try to fetch the new code.

The live preview feature relies on `runtime.connect` and `port.onDisconnect`
to cleanup the temporary code. See livePreview in /edit.
*/

const styleUtil = {};

/* exported styleMan */
const styleMan = (() => {

  Object.assign(styleUtil, {
    id2style,
    handleSave,
    uuid2style,
  });

  //#region Declarations

  /** @typedef {{
    style: StyleObj,
    preview?: StyleObj,
    appliesTo: Set<string>,
  }} StyleMapData */
  /** @type {Map<number,StyleMapData>} */
  const dataMap = new Map();
  /** @typedef {Object<styleId,{id: number, code: string[]}>} StyleSectionsToApply */
  /** @type {Map<string,{maybeMatch: Set<styleId>, sections: StyleSectionsToApply}>} */
  const cachedStyleForUrl = createCache({
    onDeleted(url, cache) {
      for (const section of Object.values(cache.sections)) {
        const data = id2data(section.id);
        if (data) data.appliesTo.delete(url);
      }
    },
  });
  const BAD_MATCHER = {test: () => false};
  const compileRe = createCompiler(text => `^(${text})$`);
  const compileSloppyRe = createCompiler(text => `^${text}$`);
  const compileExclusion = createCompiler(buildExclusion);
  const uuidv4 = crypto.randomUUID ? crypto.randomUUID.bind(crypto) : (() => {
    const seeds = crypto.getRandomValues(new Uint16Array(8));
    // 00001111-2222-M333-N444-555566667777
    seeds[3] = seeds[3] & 0x0FFF | 0x4000; // UUID version 4, M = 4
    seeds[4] = seeds[4] & 0x3FFF | 0x8000; // UUID variant 1, N = 8..0xB
    return Array.from(seeds, hex4dashed).join('');
  });
  const MISSING_PROPS = {
    name: style => `ID: ${style.id}`,
    _id: () => uuidv4(),
    _rev: () => Date.now(),
  };
  const DELETE_IF_NULL = ['id', 'customName', 'md5Url', 'originalMd5'];
  const INJ_ORDER = 'injectionOrder';
  const order = {main: {}, prio: {}};
  const orderWrap = {
    id: INJ_ORDER,
    value: mapObj(order, () => []),
    _id: `${chrome.runtime.id}-${INJ_ORDER}`,
    _rev: 0,
  };
  uuidIndex.addCustomId(orderWrap, {set: setOrder});
  /** @type {Promise|boolean} will be `true` to avoid wasting a microtask tick on each `await` */
  let ready = Promise.all([init(), prefs.ready]);

  chrome.runtime.onConnect.addListener(port => {
    if (port.name === 'livePreview') {
      handleLivePreview(port);
    } else if (port.name.startsWith('draft:')) {
      handleDraft(port);
    }
  });
  colorScheme.onChange(value => {
    msg.broadcastExtension({method: 'colorScheme', value});
    for (const {style} of dataMap.values()) {
      if (colorScheme.SCHEMES.includes(style.preferScheme)) {
        broadcastStyleUpdated(style, 'colorScheme');
      }
    }
  });

  //#endregion
  //#region Exports

  return {

    /** @returns {Promise<number>} style id */
    async delete(id, reason) {
      if (ready.then) await ready;
      const {style, appliesTo} = dataMap.get(id);
      const sync = reason !== 'sync';
      const uuid = style._id;
      db.styles.delete(id);
      if (sync) API.sync.delete(uuid, Date.now());
      for (const url of appliesTo) {
        const cache = cachedStyleForUrl.get(url);
        if (cache) delete cache.sections[id];
      }
      dataMap.delete(id);
      uuidIndex.delete(uuid);
      mapObj(orderWrap.value, (group, type) => {
        delete order[type][id];
        const i = group.indexOf(uuid);
        if (i >= 0) group.splice(i, 1);
      });
      setOrder(orderWrap, {calc: false});
      if (style._usw && style._usw.token) {
        // Must be called after the style is deleted from dataMap
        API.usw.revoke(id);
      }
      API.drafts.delete(id);
      await msg.broadcast({
        method: 'styleDeleted',
        style: {id},
      });
      return id;
    },

    /** @returns {Promise<StyleObj>} */
    async editSave(style) {
      if (ready.then) await ready;
      style = mergeWithMapped(style);
      style.updateDate = Date.now();
      return saveStyle(style, {reason: 'editSave'});
    },

    /** @returns {Promise<?StyleObj>} */
    async find(filter) {
      if (ready.then) await ready;
      const filterEntries = Object.entries(filter);
      for (const {style} of dataMap.values()) {
        if (filterEntries.every(([key, val]) => style[key] === val)) {
          return style;
        }
      }
      return null;
    },

    /** @returns {Promise<StyleObj[]>} */
    async getAll() {
      if (ready.then) await ready;
      return getAllAsArray();
    },

    /** @returns {Promise<Object<string,StyleObj[]>>}>} */
    async getAllOrdered(keys) {
      if (ready.then) await ready;
      const res = mapObj(orderWrap.value, group => group.map(uuid2style).filter(Boolean));
      if (res.main.length + res.prio.length < dataMap.size) {
        for (const {style} of dataMap.values()) {
          if (!(style.id in order.main) && !(style.id in order.prio)) {
            res.main.push(style);
          }
        }
      }
      return keys
        ? mapObj(res, group => group.map(style => mapObj(style, null, keys)))
        : res;
    },

    getOrder: () => orderWrap.value,

    /** @returns {Promise<StyleSectionsToApply>} */
    async getSectionsByUrl(url, id, isInitialApply) {
      if (ready.then) await ready;
      if (isInitialApply && prefs.get('disableAll')) {
        return {
          cfg: {
            disableAll: true,
          },
        };
      }
      // TODO: enable in FF when it supports sourceURL comment in style elements (also options.html)
      const {exposeStyleName} = CHROME && prefs.__values;
      const sender = CHROME && this && this.sender || {};
      if (sender.frameId === 0) {
        /* Chrome hides text frament from location.href of the page e.g. #:~:text=foo
           so we'll use the real URL reported by webNavigation API.
           TODO: if FF will do the same, this won't work as is: FF reports onCommitted too late */
        url = tabMan.get(sender.tab.id, 'url', 0) || url;
      }
      let cache = cachedStyleForUrl.get(url);
      if (!cache) {
        cache = {
          sections: {},
          maybeMatch: new Set(),
        };
        buildCache(cache, url, dataMap.values());
        cachedStyleForUrl.set(url, cache);
      } else if (cache.maybeMatch.size) {
        buildCache(cache, url, Array.from(cache.maybeMatch, id2data).filter(Boolean));
      }
      return Object.assign({cfg: {exposeStyleName, order}},
        id ? mapObj(cache.sections, null, [id])
          : cache.sections);
    },

    /** @returns {Promise<StyleObj>} */
    async get(id) {
      if (ready.then) await ready;
      return id2style(id);
    },

    /** @returns {Promise<StylesByUrlResult[]>} */
    async getByUrl(url, id = null) {
      if (ready.then) await ready;
      // FIXME: do we want to cache this? Who would like to open popup rapidly
      // or search the DB with the same URL?
      const result = [];
      const styles = id
        ? [id2style(id)].filter(Boolean)
        : getAllAsArray();
      const query = createMatchQuery(url);
      for (const style of styles) {
        let excluded = false;
        let excludedScheme = false;
        let included = false;
        let sloppy = false;
        let sectionMatched = false;
        const match = urlMatchStyle(query, style);
        // TODO: enable this when the function starts returning false
        // if (match === false) {
        // continue;
        // }
        if (match === 'included') {
          included = true;
        }
        if (match === 'excluded') {
          excluded = true;
        }
        if (match === 'excludedScheme') {
          excludedScheme = true;
        }
        for (const section of style.sections) {
          if (styleSectionGlobal(section) && styleCodeEmpty(section.code)) {
            continue;
          }
          const match = urlMatchSection(query, section);
          if (match) {
            if (match === 'sloppy') {
              sloppy = true;
            }
            sectionMatched = true;
            break;
          }
        }
        if (sectionMatched || included) {
          result.push(/** @namespace StylesByUrlResult */ {
            style, excluded, sloppy, excludedScheme, sectionMatched, included});
        }
      }
      return result;
    },

    /** @returns {Promise<StyleObj[]>} */
    async importMany(items) {
      if (ready.then) await ready;
      for (const style of items) {
        beforeSave(style);
        if (style.sourceCode && style.usercssData) {
          await usercssMan.buildCode(style);
        }
      }
      const events = await db.styles.putMany(items);
      return Promise.all(items.map((item, i) =>
        handleSave(item, {reason: 'import'}, events[i])
      ));
    },

    /** @returns {Promise<StyleObj>} */
    async install(style, reason = null) {
      if (ready.then) await ready;
      reason = reason || dataMap.has(style.id) ? 'update' : 'install';
      style = mergeWithMapped(style);
      style.originalDigest = await calcStyleDigest(style);
      // FIXME: update updateDate? what about usercss config?
      return saveStyle(style, {reason});
    },

    save: saveStyle,

    async setOrder(value) {
      if (ready.then) await ready;
      return setOrder({value}, {broadcast: true, sync: true});
    },

    /** @returns {Promise<number>} style id */
    async toggle(id, enabled) {
      if (ready.then) await ready;
      const style = Object.assign({}, id2style(id), {enabled});
      await saveStyle(style, {reason: 'toggle'});
      return id;
    },

    // using bind() to skip step-into when debugging

    /** @returns {Promise<StyleObj>} */
    addExclusion: addIncludeExclude.bind(null, 'exclusions'),
    /** @returns {Promise<StyleObj>} */
    addInclusion: addIncludeExclude.bind(null, 'inclusions'),
    /** @returns {Promise<?StyleObj>} */
    removeExclusion: removeIncludeExclude.bind(null, 'exclusions'),
    /** @returns {Promise<?StyleObj>} */
    removeInclusion: removeIncludeExclude.bind(null, 'inclusions'),

    async config(id, prop, value) {
      if (ready.then) await ready;
      const style = Object.assign({}, id2style(id));
      const {preview = {}} = dataMap.get(id);
      style[prop] = preview[prop] = value;
      return saveStyle(style, {reason: 'config'});
    },
  };

  //#endregion
  //#region Implementation

  /** @returns {StyleMapData} */
  function id2data(id) {
    return dataMap.get(id);
  }

  /** @returns {?StyleObj} */
  function id2style(id) {
    return (dataMap.get(Number(id)) || {}).style;
  }

  /** @returns {?StyleObj} */
  function uuid2style(uuid) {
    return id2style(uuidIndex.get(uuid));
  }

  /** @returns {StyleObj} */
  function createNewStyle() {
    return /** @namespace StyleObj */ {
      enabled: true,
      updateUrl: null,
      md5Url: null,
      url: null,
      originalMd5: null,
      installDate: Date.now(),
    };
  }

  /** @returns {void} */
  function storeInMap(style) {
    dataMap.set(style.id, {
      style,
      appliesTo: new Set(),
    });
    uuidIndex.set(style._id, style.id);
  }

  /** @returns {StyleObj} */
  function mergeWithMapped(style) {
    return Object.assign({},
      id2style(style.id) || createNewStyle(),
      style);
  }

  function handleDraft(port) {
    const id = port.name.split(':').pop();
    port.onDisconnect.addListener(() => API.drafts.delete(Number(id) || id));
  }

  function handleLivePreview(port) {
    let id;
    port.onMessage.addListener(style => {
      if (!id) id = style.id;
      const data = id2data(id);
      data.preview = style;
      broadcastStyleUpdated(style, 'editPreview');
    });
    port.onDisconnect.addListener(() => {
      port = null;
      if (id) {
        const data = id2data(id);
        if (data) {
          data.preview = null;
          broadcastStyleUpdated(data.style, 'editPreviewEnd');
        }
      }
    });
  }

  async function addIncludeExclude(type, id, rule) {
    if (ready.then) await ready;
    const style = Object.assign({}, id2style(id));
    const list = style[type] || (style[type] = []);
    if (list.includes(rule)) {
      throw new Error('The rule already exists');
    }
    style[type] = list.concat([rule]);
    return saveStyle(style, {reason: 'config'});
  }

  async function removeIncludeExclude(type, id, rule) {
    if (ready.then) await ready;
    const style = Object.assign({}, id2style(id));
    const list = style[type];
    if (!list || !list.includes(rule)) {
      return;
    }
    style[type] = list.filter(r => r !== rule);
    return saveStyle(style, {reason: 'config'});
  }

  function broadcastStyleUpdated(style, reason, method = 'styleUpdated') {
    const {id} = style;
    const data = id2data(id);
    const excluded = new Set();
    const updated = new Set();
    for (const [url, cache] of cachedStyleForUrl.entries()) {
      if (!data.appliesTo.has(url)) {
        cache.maybeMatch.add(id);
        continue;
      }
      const code = getAppliedCode(createMatchQuery(url), style);
      if (code) {
        updated.add(url);
        buildCacheEntry(cache, style, code);
      } else {
        excluded.add(url);
        delete cache.sections[id];
      }
    }
    data.appliesTo = updated;
    return msg.broadcast({
      method,
      reason,
      style: {
        id,
        md5Url: style.md5Url,
        enabled: style.enabled,
      },
    });
  }

  function beforeSave(style) {
    if (!style.name) {
      throw new Error('Style name is empty');
    }
    for (const key of DELETE_IF_NULL) {
      if (style[key] == null) {
        delete style[key];
      }
    }
    if (!style._id) {
      style._id = uuidv4();
    }
    style._rev = Date.now();
    fixKnownProblems(style);
  }

  async function saveStyle(style, handlingOptions) {
    beforeSave(style);
    const newId = await db.styles.put(style);
    return handleSave(style, handlingOptions, newId);
  }

  function handleSave(style, {reason, broadcast = true}, id = style.id) {
    if (style.id == null) style.id = id;
    const data = id2data(id);
    const method = data ? 'styleUpdated' : 'styleAdded';
    if (!data) {
      storeInMap(style);
    } else {
      data.style = style;
    }
    if (reason !== 'sync') {
      API.sync.putDoc(style);
    }
    if (broadcast) broadcastStyleUpdated(style, reason, method);
    return style;
  }

  // get styles matching a URL, including sloppy regexps and excluded items.
  function getAppliedCode(query, data) {
    const result = urlMatchStyle(query, data);
    if (result === 'included') {
      // return all sections
      return data.sections.map(s => s.code);
    }
    if (result !== true) {
      return;
    }
    const code = [];
    for (const section of data.sections) {
      if (urlMatchSection(query, section) === true && !styleCodeEmpty(section.code)) {
        code.push(section.code);
      }
    }
    return code.length && code;
  }

  async function init() {
    const orderPromise = API.prefsDb.get(orderWrap.id);
    const styles = await db.styles.getAll() || [];
    const updated = await Promise.all(styles.map(fixKnownProblems).filter(Boolean));
    if (updated.length) {
      await db.styles.putMany(updated);
    }
    setOrder(await orderPromise, {store: false});
    styles.forEach(storeInMap);
    ready = true;
    bgReady._resolveStyles();
  }

  function fixKnownProblems(style, initIndex, initArray) {
    let res = 0;
    for (const key in MISSING_PROPS) {
      if (!style[key]) {
        style[key] = MISSING_PROPS[key](style);
        res = 1;
      }
    }
    /* Upgrade the old way of customizing local names */
    const {originalName} = style;
    if (originalName) {
      if (originalName !== style.name) {
        style.customName = style.name;
        style.name = originalName;
      }
      delete style.originalName;
      res = 1;
    }
    /* wrong homepage url in 1.5.20-1.5.21 due to commit 1e5f118d */
    for (const key of ['url', 'installationUrl']) {
      const url = style[key];
      const fixedUrl = url && url.replace(/([^:]\/)\//, '$1');
      if (fixedUrl !== url) {
        res = 1;
        style[key] = fixedUrl;
      }
    }
    let url;
    /* USO bug, duplicate "update" subdomain, see #523 */
    if ((url = style.md5Url) && url.includes('update.update.userstyles')) {
      res = style.md5Url = url.replace('update.update.userstyles', 'update.userstyles');
    }
    /* Default homepage URL for external styles installed from a known distro */
    if (
      (!style.url || !style.installationUrl) &&
      (url = style.updateUrl) &&
      (url = URLS.extractGreasyForkInstallUrl(url) ||
        URLS.extractUsoArchiveInstallUrl(url) ||
        URLS.extractUSwInstallUrl(url)
      )
    ) {
      if (!style.url) res = style.url = url;
      if (!style.installationUrl) res = style.installationUrl = url;
    }
    /* @import must precede `vars` that we add at beginning */
    if (
      initArray &&
      !isEmptyObj((style.usercssData || {}).vars) &&
      style.sections.some(({code}) =>
        code.startsWith(':root {\n  --') &&
        /@import\s/i.test(code))
    ) {
      return usercssMan.buildCode(style);
    }
    return res && style;
  }

  function urlMatchStyle(query, style) {
    if (
      style.exclusions &&
      style.exclusions.some(e => compileExclusion(e).test(query.urlWithoutParams))
    ) {
      return 'excluded';
    }
    if (!style.enabled) {
      return 'disabled';
    }
    if (!colorScheme.shouldIncludeStyle(style)) {
      return 'excludedScheme';
    }
    if (
      style.inclusions &&
      style.inclusions.some(r => compileExclusion(r).test(query.urlWithoutParams))
    ) {
      return 'included';
    }
    return true;
  }

  function urlMatchSection(query, section) {
    if (
      section.domains &&
      section.domains.some(d => d === query.domain || query.domain.endsWith(`.${d}`))
    ) {
      return true;
    }
    if (section.urlPrefixes && section.urlPrefixes.some(p => p && query.url.startsWith(p))) {
      return true;
    }
    // as per spec the fragment portion is ignored in @-moz-document:
    // https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
    // but the spec is outdated and doesn't account for SPA sites
    // so we only respect it for `url()` function
    if (section.urls && (
      section.urls.includes(query.url) ||
      section.urls.includes(query.urlWithoutHash)
    )) {
      return true;
    }
    if (section.regexps && section.regexps.some(r => compileRe(r).test(query.url))) {
      return true;
    }
    /*
    According to CSS4 @document specification the entire URL must match.
    Stylish-for-Chrome implemented it incorrectly since the very beginning.
    We'll detect styles that abuse the bug by finding the sections that
    would have been applied by Stylish but not by us as we follow the spec.
    */
    if (section.regexps && section.regexps.some(r => compileSloppyRe(r).test(query.url))) {
      return 'sloppy';
    }
    // TODO: check for invalid regexps?
    return styleSectionGlobal(section);
  }

  function createCompiler(compile) {
    // FIXME: FIFO cache doesn't work well here, if we want to match many
    // regexps more than the cache size, we will never hit the cache because
    // the first cache is deleted. So we use a simple map but it leaks memory.
    const cache = new Map();
    return text => {
      let re = cache.get(text);
      if (!re) {
        re = tryRegExp(compile(text));
        if (!re) {
          re = BAD_MATCHER;
        }
        cache.set(text, re);
      }
      return re;
    };
  }

  function compileGlob(text) {
    return stringAsRegExp(text, '', true)
      .replace(/\\\\\\\*|\\\*/g, m => m.length > 2 ? m : '.*');
  }

  function buildExclusion(text) {
    // match pattern
    const match = text.match(/^(\*|[\w-]+):\/\/(\*\.)?([\w.]+\/.*)/);
    if (!match) {
      return '^' + compileGlob(text) + '$';
    }
    return '^' +
      (match[1] === '*' ? '[\\w-]+' : match[1]) +
      '://' +
      (match[2] ? '(?:[\\w.]+\\.)?' : '') +
      compileGlob(match[3]) +
      '$';
  }

  function createMatchQuery(url) {
    let urlWithoutHash;
    let urlWithoutParams;
    let domain;
    return {
      url,
      get urlWithoutHash() {
        if (!urlWithoutHash) {
          urlWithoutHash = url.split('#')[0];
        }
        return urlWithoutHash;
      },
      get urlWithoutParams() {
        if (!urlWithoutParams) {
          const u = tryURL(url);
          urlWithoutParams = u.origin + u.pathname;
        }
        return urlWithoutParams;
      },
      get domain() {
        if (!domain) {
          const u = tryURL(url);
          domain = u.hostname;
        }
        return domain;
      },
    };
  }

  function buildCache(cache, url, styleList) {
    const query = createMatchQuery(url);
    for (const {style, appliesTo, preview} of styleList) {
      const code = getAppliedCode(query, preview || style);
      if (code) {
        buildCacheEntry(cache, style, code);
        appliesTo.add(url);
      }
    }
  }

  function buildCacheEntry(cache, style, code = style.code) {
    cache.sections[style.id] = {
      code,
      id: style.id,
      name: style.customName || style.name,
    };
  }

  /** @returns {StyleObj[]} */
  function getAllAsArray() {
    return Array.from(dataMap.values(), v => v.style);
  }

  /** uuidv4 helper: converts to a 4-digit hex string and adds "-" at required positions */
  function hex4dashed(num, i) {
    return (num + 0x10000).toString(16).slice(-4) + (i >= 1 && i <= 4 ? '-' : '');
  }

  async function setOrder(data, {broadcast, calc = true, store = true, sync} = {}) {
    if (!data || !data.value || deepEqual(data.value, orderWrap.value)) {
      return;
    }
    Object.assign(orderWrap, data, sync && {_rev: Date.now()});
    if (calc) {
      for (const [type, group] of Object.entries(data.value)) {
        const dst = order[type] = {};
        group.forEach((uuid, i) => {
          const id = uuidIndex.get(uuid);
          if (id) dst[id] = i;
        });
      }
    }
    if (broadcast) {
      msg.broadcast({method: 'styleSort', order});
    }
    if (store) {
      await API.prefsDb.put(orderWrap, orderWrap.id);
    }
    if (sync) {
      API.sync.putDoc(orderWrap);
    }
  }

  //#endregion
})();
