/* global getStyleWithNoCode styleSectionsEqual */
'use strict';

const RX_NAMESPACE = /\s*(@namespace\s+(?:\S+\s+)?url\(http:\/\/.*?\);)\s*/g;
const RX_CHARSET = /\s*@charset\s+(['"]).*?\1\s*;\s*/g;
const RX_CSS_COMMENTS = /\/\*[\s\S]*?(?:\*\/|$)/g;
// eslint-disable-next-line no-var
var SLOPPY_REGEXP_PREFIX = '\0';

// CSS transition bug workaround: since we insert styles asynchronously,
// the browsers, especially Firefox, may apply all transitions on page load
const CSS_TRANSITION_SUPPRESSOR = '* { transition: none !important; }';
const RX_CSS_TRANSITION_DETECTOR = /([\s\n;/{]|-webkit-|-moz-)transition[\s\n]*:[\s\n]*(?!none)/;

// Note, only 'var'-declared variables are visible from another extension page
// eslint-disable-next-line no-var
var cachedStyles = {
  list: null,            // array of all styles
  byId: new Map(),       // all styles indexed by id
  filters: new Map(),    // filterStyles() parameters mapped to the returned results, 10k max
  regexps: new Map(),    // compiled style regexps
  exclusions: new Map(), // compiled exclusion regexps
  urlDomains: new Map(), // getDomain() results for 100 last checked urls
  needTransitionPatch: new Map(), // FF bug workaround
  mutex: {
    inProgress: true,    // while getStyles() is reading IndexedDB all subsequent calls
                         // (initially 'true' to prevent rogue getStyles before dbExec.initialized)
    onDone: [],          // to getStyles() are queued and resolved when the first one finishes
  },
};

// eslint-disable-next-line no-var
var dbExec = dbExecIndexedDB;
dbExec.initialized = false;

// we use chrome.storage.local fallback if IndexedDB doesn't save data,
// which, once detected on the first run, is remembered in chrome.storage.local
// for reliablility and in localStorage for fast synchronous access
// (FF may block localStorage depending on its privacy options)
do {
  const done = () => {
    cachedStyles.mutex.inProgress = false;
    getStyles().then(() => {
      dbExec.initialized = true;
      window.dispatchEvent(new Event('storageReady'));
    });
  };
  const fallback = () => {
    dbExec = dbExecChromeStorage;
    chromeLocal.set({dbInChromeStorage: true});
    localStorage.dbInChromeStorage = 'true';
    ignoreChromeError();
    done();
  };
  const fallbackSet = localStorage.dbInChromeStorage;
  if (fallbackSet === 'true' || !tryCatch(() => indexedDB)) {
    fallback();
    break;
  } else if (fallbackSet === 'false') {
    done();
    break;
  }
  chromeLocal.get('dbInChromeStorage')
    .then(data =>
      data && data.dbInChromeStorage && Promise.reject())
    .then(() =>
      tryCatch(dbExecIndexedDB, 'getAllKeys', IDBKeyRange.lowerBound(1), 1) ||
      Promise.reject())
    .then(({target}) => (
      (target.result || [])[0] ?
        Promise.reject('ok') :
        dbExecIndexedDB('put', {id: -1})))
    .then(() =>
      dbExecIndexedDB('get', -1))
    .then(({target}) => (
      (target.result || {}).id === -1 ?
        dbExecIndexedDB('delete', -1) :
        Promise.reject()))
    .then(() =>
      Promise.reject('ok'))
    .catch(result => {
      if (result === 'ok') {
        chromeLocal.set({dbInChromeStorage: false});
        localStorage.dbInChromeStorage = 'false';
        done();
      } else {
        fallback();
      }
    });
} while (0);


function dbExecIndexedDB(method, ...args) {
  return new Promise((resolve, reject) => {
    Object.assign(indexedDB.open('stylish', 2), {
      onsuccess(event) {
        const database = event.target.result;
        if (!method) {
          resolve(database);
        } else {
          const transaction = database.transaction(['styles'], 'readwrite');
          const store = transaction.objectStore('styles');
          Object.assign(store[method](...args), {
            onsuccess: event => resolve(event, store, transaction, database),
            onerror: reject,
          });
        }
      },
      onerror(event) {
        console.warn(event.target.error || event.target.errorCode);
        reject(event);
      },
      onupgradeneeded(event) {
        if (event.oldVersion === 0) {
          event.target.result.createObjectStore('styles', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  });
}


function dbExecChromeStorage(method, data) {
  const STYLE_KEY_PREFIX = 'style-';
  switch (method) {
    case 'get':
      return chromeLocal.getValue(STYLE_KEY_PREFIX + data)
        .then(result => ({target: {result}}));

    case 'put':
      if (!data.id) {
        return getStyles().then(() => {
          data.id = 1;
          for (const style of cachedStyles.list) {
            data.id = Math.max(data.id, style.id + 1);
          }
          return dbExecChromeStorage('put', data);
        });
      }
      return chromeLocal.setValue(STYLE_KEY_PREFIX + data.id, data)
        .then(() => (chrome.runtime.lastError ? Promise.reject() : data.id));

    case 'delete':
      return chromeLocal.remove(STYLE_KEY_PREFIX + data);

    case 'getAll':
      return chromeLocal.get(null).then(storage => {
        const styles = [];
        for (const key in storage) {
          if (key.startsWith(STYLE_KEY_PREFIX) &&
              Number(key.substr(STYLE_KEY_PREFIX.length))) {
            styles.push(storage[key]);
          }
        }
        return {target: {result: styles}};
      });
  }
  return Promise.reject();
}


function getStyles(options) {
  if (cachedStyles.list) {
    return Promise.resolve(filterStyles(options));
  }
  if (cachedStyles.mutex.inProgress) {
    return new Promise(resolve => {
      cachedStyles.mutex.onDone.push({options, resolve});
    });
  }
  cachedStyles.mutex.inProgress = true;

  return dbExec('getAll').then(event => {
    cachedStyles.list = event.target.result || [];
    cachedStyles.byId.clear();
    for (const style of cachedStyles.list) {
      cachedStyles.byId.set(style.id, style);
      if (!style.name) {
        style.name = 'ID: ' + style.id;
      }
    }

    cachedStyles.mutex.inProgress = false;
    for (const {options, resolve} of cachedStyles.mutex.onDone) {
      resolve(filterStyles(options));
    }
    cachedStyles.mutex.onDone = [];
    return filterStyles(options);
  });
}


function filterStyles({
  enabled = null,
  id = null,
  matchUrl = null,
  md5Url = null,
  asHash = null,
  omitCode,
  strictRegexp = true, // used by the popup to detect bad regexps
} = {}) {
  if (id) id = Number(id);
  if (asHash) enabled = true;

  if (
    enabled === null &&
    id === null &&
    matchUrl === null &&
    md5Url === null &&
    asHash !== true
  ) {
    return cachedStyles.list;
  }

  if (matchUrl && !URLS.supported(matchUrl)) {
    return asHash ? {length: 0} : [];
  }

  const blankHash = asHash && {
    length: 0,
    disableAll: prefs.get('disableAll'),
    exposeIframes: prefs.get('exposeIframes'),
  };

  // make sure to use the same order in updateFiltersCache()
  const cacheKey =
    enabled + '\t' +
    id + '\t' +
    matchUrl + '\t' +
    md5Url + '\t' +
    asHash + '\t' +
    strictRegexp;
  const cached = cachedStyles.filters.get(cacheKey);
  let styles;
  if (cached) {
    cached.hits++;
    cached.lastHit = Date.now();
    styles = asHash
      ? Object.assign(blankHash, cached.styles)
      : cached.styles.slice();
  } else {
    styles = filterStylesInternal({
      enabled,
      id,
      matchUrl,
      md5Url,
      asHash,
      strictRegexp,
      blankHash,
      cacheKey,
      omitCode,
    });
  }
  if (!omitCode) return styles;
  if (!asHash) return styles.map(getStyleWithNoCode);
  for (const id in styles) {
    const sections = styles[id];
    if (Array.isArray(sections)) {
      styles[id] = getStyleWithNoCode({sections}).sections;
    }
  }
  return styles;
}


function filterStylesInternal({
  // js engines don't like big functions (V8 often deoptimized the original filterStyles)
  // it also makes sense to extract the less frequently executed code
  enabled,
  id,
  matchUrl,
  md5Url,
  asHash,
  strictRegexp,
  blankHash,
  cacheKey,
  omitCode,
}) {
  if (matchUrl && !cachedStyles.urlDomains.has(matchUrl)) {
    cachedStyles.urlDomains.set(matchUrl, getDomains(matchUrl));
    for (let i = cachedStyles.urlDomains.size - 100; i > 0; i--) {
      const firstKey = cachedStyles.urlDomains.keys().next().value;
      cachedStyles.urlDomains.delete(firstKey);
    }
  }

  const styles = id === null
    ? cachedStyles.list
    : [cachedStyles.byId.get(id)];
  if (!styles[0]) {
    // may happen when users [accidentally] reopen an old URL
    // of edit.html with a non-existent style id parameter
    return asHash ? blankHash : [];
  }
  const filtered = asHash ? {length: 0} : [];
  const needSections = asHash || matchUrl !== null;
  const matchUrlBase = matchUrl && matchUrl.includes('#') && matchUrl.split('#', 1)[0];

  let style;
  for (let i = 0; (style = styles[i]); i++) {
    if ((enabled === null || style.enabled === enabled)
    && (md5Url === null || style.md5Url === md5Url)
    && (id === null || style.id === id)) {
      const sections = needSections &&
        getApplicableSections({
          style,
          matchUrl,
          strictRegexp,
          stopOnFirst: !asHash,
          skipUrlCheck: true,
          matchUrlBase,
          omitCode,
        });
      if (asHash) {
        if (sections.length) {
          filtered[style.id] = sections;
          filtered.length++;
        }
      } else if (matchUrl === null || sections.length) {
        filtered.push(style);
      }
    }
  }

  cachedStyles.filters.set(cacheKey, {
    styles: filtered,
    lastHit: Date.now(),
    hits: 1,
  });
  if (cachedStyles.filters.size > 10000) {
    cleanupCachedFilters();
  }

  // a shallow copy is needed because the cache doesn't store options like disableAll
  return asHash
    ? Object.assign(blankHash, filtered)
    : filtered;
}


function saveStyle(style) {
  const id = Number(style.id) || null;
  const reason = style.reason;
  const notify = style.notify !== false;
  delete style.method;
  delete style.reason;
  delete style.notify;
  if (!style.name) {
    delete style.name;
  }
  let existed;
  let codeIsUpdated;
  return maybeCalcDigest()
    .then(maybeImportFix)
    .then(decide);

  function maybeCalcDigest() {
    if (['install', 'update', 'update-digest'].includes(reason)) {
      return calcStyleDigest(style).then(digest => {
        style.originalDigest = digest;
      });
    }
    return Promise.resolve();
  }

  function maybeImportFix() {
    if (reason === 'import') {
      style.originalDigest = style.originalDigest || style.styleDigest; // TODO: remove in the future
      delete style.styleDigest; // TODO: remove in the future
      if (typeof style.originalDigest !== 'string' || style.originalDigest.length !== 40) {
        delete style.originalDigest;
      }
    }
  }

  function decide() {
    if (id !== null) {
      // Update or create
      style.id = id;
      return dbExec('get', id).then((event, store) => {
        const oldStyle = event.target.result;
        existed = Boolean(oldStyle);
        if (reason === 'update-digest' && oldStyle.originalDigest === style.originalDigest) {
          return style;
        }
        codeIsUpdated = !existed
          || 'sections' in style && !styleSectionsEqual(style, oldStyle)
          || reason === 'exclusionsUpdated';
        style = Object.assign({installDate: Date.now()}, oldStyle, style);
        return write(style, store);
      });
    } else {
      // Create
      delete style.id;
      style = Object.assign({
        // Set optional things if they're undefined
        enabled: true,
        updateUrl: null,
        md5Url: null,
        url: null,
        originalMd5: null,
        installDate: Date.now(),
        exclusions: {}
      }, style);
      return write(style);
    }
  }

  function write(style, store) {
    style.sections = normalizeStyleSections(style);
    if (store) {
      return new Promise(resolve => {
        store.put(style).onsuccess = event => resolve(done(event));
      });
    } else {
      return dbExec('put', style).then(done);
    }
  }

  function done(event) {
    if (reason === 'update-digest') {
      return style;
    }
    style.id = style.id || event.target.result;
    invalidateCache(existed ? {updated: style} : {added: style});
    if (notify) {
      const method = reason === 'exclusionsUpdated' ? reason :
        existed ? 'styleUpdated' : 'styleAdded';
      notifyAllTabs({method, style, codeIsUpdated, reason});
    }
    return style;
  }
}


function deleteStyle({id, notify = true}) {
  id = Number(id);
  return dbExec('delete', id).then(() => {
    invalidateCache({deletedId: id});
    if (notify) {
      notifyAllTabs({method: 'styleDeleted', id});
    }
    return id;
  });
}


function compileExclusionRegexps(exclusions) {
  exclusions.forEach(exclusion => {
    if (!cachedStyles.exclusions.get(exclusion)) {
      cachedStyles.exclusions.set(exclusion, tryRegExp(exclusion) || false);
    }
  });
}

function isPageExcluded(matchUrl, exclusions = {}) {
  const keys = Object.keys(exclusions);
  if (!keys.length) {
    return false;
  }
  compileExclusionRegexps(keys);
  return keys.some(exclude => {
    const rx = cachedStyles.exclusions.get(exclude);
    return rx && rx.test(matchUrl);
  });
}


function getApplicableSections({
  style,
  matchUrl,
  strictRegexp = true,
  // filterStylesInternal() sets the following to avoid recalc on each style:
  stopOnFirst,
  skipUrlCheck,
  matchUrlBase = matchUrl.includes('#') && matchUrl.split('#', 1)[0],
  omitCode,
  // as per spec the fragment portion is ignored in @-moz-document:
  // https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
  // but the spec is outdated and doesn't account for SPA sites
  // so we only respect it in case of url("http://exact.url/without/hash")
}) {
  if (!skipUrlCheck && !URLS.supported(matchUrl) || omitCode !== false && isPageExcluded(matchUrl, style.exclusions)) {
    return [];
  }
  const sections = [];
  for (const section of style.sections) {
    const {urls, domains, urlPrefixes, regexps, code} = section;
    const isGlobal = !urls.length && !urlPrefixes.length && !domains.length && !regexps.length;
    const isMatching = !isGlobal && (
      urls.length
        && (urls.includes(matchUrl) || matchUrlBase && urls.includes(matchUrlBase))
      || urlPrefixes.length
        && arraySomeIsPrefix(urlPrefixes, matchUrl)
      || domains.length
        && arraySomeIn(cachedStyles.urlDomains.get(matchUrl) || getDomains(matchUrl), domains)
      || regexps.length
        && arraySomeMatches(regexps, matchUrl, strictRegexp));
    if (isGlobal && !styleCodeEmpty(code) || isMatching) {
      sections.push(section);
      if (stopOnFirst) {
        break;
      }
    }
  }
  return sections;

  function arraySomeIsPrefix(array, string) {
    for (const prefix of array) {
      if (string.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  function arraySomeIn(array, haystack) {
    for (const el of array) {
      if (haystack.indexOf(el) >= 0) {
        return true;
      }
    }
    return false;
  }

  function arraySomeMatches(array, matchUrl, strictRegexp) {
    for (const regexp of array) {
      for (let pass = 1; pass <= (strictRegexp ? 1 : 2); pass++) {
        const cacheKey = pass === 1 ? regexp : SLOPPY_REGEXP_PREFIX + regexp;
        let rx = cachedStyles.regexps.get(cacheKey);
        if (rx === false) {
          // invalid regexp
          break;
        }
        if (!rx) {
          const anchored = pass === 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
          rx = tryRegExp(anchored);
          cachedStyles.regexps.set(cacheKey, rx || false);
          if (!rx) {
            // invalid regexp
            break;
          }
        }
        if (rx.test(matchUrl)) {
          return true;
        }
      }
    }
    return false;
  }
}


function styleCodeEmpty(code) {
  // Collect the global section if it's not empty, not comment-only, not namespace-only.
  const cmtOpen = code && code.indexOf('/*');
  if (cmtOpen >= 0) {
    const cmtCloseLast = code.lastIndexOf('*/');
    if (cmtCloseLast < 0) {
      code = code.substr(0, cmtOpen);
    } else {
      code = code.substr(0, cmtOpen) +
        code.substring(cmtOpen, cmtCloseLast + 2).replace(RX_CSS_COMMENTS, '') +
        code.substr(cmtCloseLast + 2);
    }
  }
  if (!code || !code.trim()) return true;
  if (code.includes('@namespace')) code = code.replace(RX_NAMESPACE, '').trim();
  if (code.includes('@charset')) code = code.replace(RX_CHARSET, '').trim();
  return !code;
}


function invalidateCache({added, updated, deletedId} = {}) {
  if (!cachedStyles.list) return;
  const id = added ? added.id : updated ? updated.id : deletedId;
  const cached = cachedStyles.byId.get(id);

  if (updated) {
    if (cached) {
      const isSectionGlobal = section =>
        !section.urls.length &&
        !section.urlPrefixes.length &&
        !section.domains.length &&
        !section.regexps.length;
      const hadOrHasGlobals = cached.sections.some(isSectionGlobal) ||
                              updated.sections.some(isSectionGlobal);
      const reenabled = !cached.enabled && updated.enabled;
      const equal = !hadOrHasGlobals &&
                    !reenabled &&
                    styleSectionsEqual(updated, cached, {ignoreCode: true});
      Object.assign(cached, updated);
      if (equal) {
        updateFiltersCache(cached);
      } else {
        cachedStyles.filters.clear();
      }
      cachedStyles.needTransitionPatch.delete(id);
      return;
    } else {
      added = updated;
    }
  }

  if (added) {
    if (!cached) {
      cachedStyles.list.push(added);
      cachedStyles.byId.set(added.id, added);
      cachedStyles.filters.clear();
      cachedStyles.needTransitionPatch.delete(id);
    }
    return;
  }

  if (deletedId !== undefined) {
    if (cached) {
      const cachedIndex = cachedStyles.list.indexOf(cached);
      cachedStyles.list.splice(cachedIndex, 1);
      cachedStyles.byId.delete(deletedId);
      for (const {styles} of cachedStyles.filters.values()) {
        if (Array.isArray(styles)) {
          const index = styles.findIndex(({id}) => id === deletedId);
          if (index >= 0) styles.splice(index, 1);
        } else if (deletedId in styles) {
          delete styles[deletedId];
          styles.length--;
        }
      }
      cachedStyles.needTransitionPatch.delete(id);
      return;
    }
  }

  cachedStyles.list = null;
  cachedStyles.filters.clear();
  cachedStyles.needTransitionPatch.clear(id);
}


function updateFiltersCache(style) {
  const {id} = style;
  for (const [key, {styles}] of cachedStyles.filters.entries()) {
    if (Array.isArray(styles)) {
      const index = styles.findIndex(style => style.id === id);
      if (index >= 0) styles[index] = Object.assign({}, style);
      continue;
    }
    if (id in styles) {
      const [, , matchUrl, , , strictRegexp] = key.split('\t');
      if (!style.enabled) {
        delete styles[id];
        styles.length--;
        continue;
      }
      const matchUrlBase = matchUrl && matchUrl.includes('#') && matchUrl.split('#', 1)[0];
      const sections = getApplicableSections({
        style,
        matchUrl,
        matchUrlBase,
        strictRegexp,
        skipUrlCheck: true,
        omitCode: false
      });
      if (sections.length) {
        styles[id] = sections;
      } else {
        delete styles[id];
        styles.length--;
      }
    }
  }
}


function cleanupCachedFilters({force = false} = {}) {
  if (!force) {
    debounce(cleanupCachedFilters, 1000, {force: true});
    return;
  }
  const size = cachedStyles.filters.size;
  const oldestHit = cachedStyles.filters.values().next().value.lastHit;
  const now = Date.now();
  const timeSpan = now - oldestHit;
  const recencyWeight = 5 / size;
  const hitWeight = 1 / 4; // we make ~4 hits per URL
  const lastHitWeight = 10;
  // delete the oldest 10%
  [...cachedStyles.filters.entries()]
    .map(([id, v], index) => ({
      id,
      weight:
        index * recencyWeight +
        v.hits * hitWeight +
        (v.lastHit - oldestHit) / timeSpan * lastHitWeight,
    }))
    .sort((a, b) => a.weight - b.weight)
    .slice(0, size / 10 + 1)
    .forEach(({id}) => cachedStyles.filters.delete(id));
}


function getDomains(url) {
  let d = /.*?:\/*([^/:]+)|$/.exec(url)[1];
  if (!d || url.startsWith('file:')) {
    return [];
  }
  const domains = [d];
  while (d.indexOf('.') !== -1) {
    d = d.substring(d.indexOf('.') + 1);
    domains.push(d);
  }
  return domains;
}


function normalizeStyleSections({sections}) {
  // retain known properties in an arbitrarily predefined order
  return (sections || []).map(section => ({
    code: section.code || '',
    urls: section.urls || [],
    urlPrefixes: section.urlPrefixes || [],
    domains: section.domains || [],
    regexps: section.regexps || [],
  }));
}


function calcStyleDigest(style) {
  const jsonString = style.usercssData ?
    style.sourceCode : JSON.stringify(normalizeStyleSections(style));
  const text = new TextEncoder('utf-8').encode(jsonString);
  return crypto.subtle.digest('SHA-1', text).then(hex);

  function hex(buffer) {
    const parts = [];
    const PAD8 = '00000000';
    const view = new DataView(buffer);
    for (let i = 0; i < view.byteLength; i += 4) {
      parts.push((PAD8 + view.getUint32(i).toString(16)).slice(-8));
    }
    return parts.join('');
  }
}


function handleCssTransitionBug({tabId, frameId, url, styles}) {
  for (let id in styles) {
    id |= 0;
    if (!id) {
      continue;
    }
    let need = cachedStyles.needTransitionPatch.get(id);
    if (need === false) {
      continue;
    }
    if (need !== true) {
      need = styles[id].some(sectionContainsTransitions);
      cachedStyles.needTransitionPatch.set(id, need);
      if (!need) {
        continue;
      }
    }
    if (FIREFOX && !url.startsWith(URLS.ownOrigin)) {
      patchFirefox();
    } else {
      styles.needTransitionPatch = true;
    }
    break;
  }

  function patchFirefox() {
    const options = {
      frameId,
      code: CSS_TRANSITION_SUPPRESSOR,
      matchAboutBlank: true,
    };
    if (FIREFOX >= 53) {
      options.cssOrigin = 'user';
    }
    browser.tabs.insertCSS(tabId, Object.assign(options, {
      runAt: 'document_start',
    })).then(() => setTimeout(() => {
      browser.tabs.removeCSS(tabId, options).catch(ignoreChromeError);
    })).catch(ignoreChromeError);
  }

  function sectionContainsTransitions(section) {
    let code = section.code;
    const firstTransition = code.indexOf('transition');
    if (firstTransition < 0) {
      return false;
    }
    const firstCmt = code.indexOf('/*');
    // check the part before the first comment
    if (firstCmt < 0 || firstTransition < firstCmt) {
      if (quickCheckAround(code, firstTransition)) {
        return true;
      } else if (firstCmt < 0) {
        return false;
      }
    }
    // check the rest
    const lastCmt = code.lastIndexOf('*/');
    if (lastCmt < firstCmt) {
      // the comment is unclosed and we already checked the preceding part
      return false;
    }
    let mid = code.slice(firstCmt, lastCmt + 2);
    mid = mid.indexOf('*/') === mid.length - 2 ? '' : mid.replace(RX_CSS_COMMENTS, '');
    code = mid + code.slice(lastCmt + 2);
    return quickCheckAround(code) || RX_CSS_TRANSITION_DETECTOR.test(code);
  }

  function quickCheckAround(code, pos = code.indexOf('transition')) {
    return RX_CSS_TRANSITION_DETECTOR.test(code.substr(Math.max(0, pos - 10), 50));
  }
}


/*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  Additionally we'll check for invalid regexps.
*/
function detectSloppyRegexps({matchUrl, ids}) {
  const results = [];
  for (const id of ids) {
    const style = cachedStyles.byId.get(id);
    if (!style) continue;
    // make sure all regexps are compiled
    const rxCache = cachedStyles.regexps;
    let hasRegExp = false;
    for (const section of style.sections) {
      for (const regexp of section.regexps) {
        hasRegExp = true;
        for (let pass = 1; pass <= 2; pass++) {
          const cacheKey = pass === 1 ? regexp : SLOPPY_REGEXP_PREFIX + regexp;
          if (!rxCache.has(cacheKey)) {
            // according to CSS4 @document specification the entire URL must match
            const anchored = pass === 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
            // create in the bg context to avoid leaking of "dead objects"
            const rx = tryRegExp(anchored);
            rxCache.set(cacheKey, rx || false);
          }
        }
      }
    }
    if (!hasRegExp) continue;
    const applied = getApplicableSections({style, matchUrl, omitCode: false});
    const wannabe = getApplicableSections({style, matchUrl, omitCode: false, strictRegexp: false});
    results.push({
      id,
      applied,
      skipped: wannabe.length - applied.length,
      hasInvalidRegexps: wannabe.some(({regexps}) => regexps.some(rx => !rxCache.has(rx))),
    });
  }
  return results;
}
