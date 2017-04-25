'use strict';

const RX_NAMESPACE = new RegExp([/[\s\r\n]*/,
  /(@namespace[\s\r\n]+(?:[^\s\r\n]+[\s\r\n]+)?url\(http:\/\/.*?\);)/,
  /[\s\r\n]*/].map(rx => rx.source).join(''), 'g');
const RX_CSS_COMMENTS = /\/\*[\s\S]*?\*\//g;
const SLOPPY_REGEXP_PREFIX = '\0';
const DIGEST_KEY_PREFIX = 'originalDigest';

// Note, only 'var'-declared variables are visible from another extension page
// eslint-disable-next-line no-var
var cachedStyles = {
  list: null,            // array of all styles
  byId: new Map(),       // all styles indexed by id
  filters: new Map(),    // filterStyles() parameters mapped to the returned results, 10k max
  regexps: new Map(),    // compiled style regexps
  urlDomains: new Map(), // getDomain() results for 100 last checked urls
  emptyCode: new Map(),  // entire code is comments/whitespace/@namespace
  mutex: {
    inProgress: false,   // while getStyles() is reading IndexedDB all subsequent calls
    onDone: [],          // to getStyles() are queued and resolved when the first one finishes
  },
};

// eslint-disable-next-line no-var
var chromeLocal = {
  get(options) {
    return new Promise(resolve => {
      chrome.storage.local.get(options, data => resolve(data));
    });
  },
  set(data) {
    return new Promise(resolve => {
      chrome.storage.local.set(data, () => resolve(data));
    });
  },
  getValue(key) {
    return chromeLocal.get(key).then(data => data[key]);
  },
  setValue(key, value) {
    return chromeLocal.set({[key]: value});
  },
};


function dbExec(method, data) {
  return new Promise((resolve, reject) => {
    Object.assign(indexedDB.open('stylish', 2), {
      onsuccess(event) {
        const database = event.target.result;
        if (!method) {
          resolve(database);
        } else {
          const transaction = database.transaction(['styles'], 'readwrite');
          const store = transaction.objectStore('styles');
          Object.assign(store[method](data), {
            onsuccess: event => resolve(event, store, transaction, database),
            onerror: reject,
          });
        }
      },
      onerror(event) {
        console.warn(event.target.errorCode);
        reject(event);
      },
      onupgradeneeded(event) {
        if (event.oldVersion == 0) {
          event.target.result.createObjectStore('styles', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  });
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
    const t0 = performance.now();
    let hasTimeToCompile = true;
    for (const style of cachedStyles.list) {
      cachedStyles.byId.set(style.id, style);
      if (hasTimeToCompile) {
        hasTimeToCompile = !compileStyleRegExps({style}) || performance.now() - t0 > 100;
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
  url = null,
  id = null,
  matchUrl = null,
  asHash = null,
  strictRegexp = true, // used by the popup to detect bad regexps
} = {}) {
  enabled = enabled === null || typeof enabled == 'boolean' ? enabled :
    typeof enabled == 'string' ? enabled == 'true' : null;
  id = id === null ? null : Number(id);

  if (enabled === null
  && url === null
  && id === null
  && matchUrl === null
  && asHash != true) {
    return cachedStyles.list;
  }
  const disableAll = asHash && prefs.get('disableAll', false);

  if (matchUrl && matchUrl.startsWith(URLS.chromeWebStore)) {
    // CWS cannot be scripted in chromium, see ChromeExtensionsClient::IsScriptableURL
    // https://cs.chromium.org/chromium/src/chrome/common/extensions/chrome_extensions_client.cc
    return asHash ? {} : [];
  }

  // add \t after url to prevent collisions (not sure it can actually happen though)
  const cacheKey = ' ' + enabled + url + '\t' + id + matchUrl + '\t' + asHash + strictRegexp;
  const cached = cachedStyles.filters.get(cacheKey);
  if (cached) {
    cached.hits++;
    cached.lastHit = Date.now();
    return asHash
      ? Object.assign({disableAll}, cached.styles)
      : cached.styles;
  }

  return filterStylesInternal({
    enabled,
    url,
    id,
    matchUrl,
    asHash,
    strictRegexp,
    disableAll,
    cacheKey,
  });
}


function filterStylesInternal({
  // js engines don't like big functions (V8 often deoptimized the original filterStyles)
  // it also makes sense to extract the less frequently executed code
  enabled,
  url,
  id,
  matchUrl,
  asHash,
  strictRegexp,
  disableAll,
  cacheKey,
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
  const filtered = asHash ? {} : [];
  if (!styles) {
    // may happen when users [accidentally] reopen an old URL
    // of edit.html with a non-existent style id parameter
    return filtered;
  }

  const needSections = asHash || matchUrl !== null;

  for (let i = 0, style; (style = styles[i]); i++) {
    if ((enabled === null || style.enabled == enabled)
    && (url === null || style.url == url)
    && (id === null || style.id == id)) {
      const sections = needSections &&
        getApplicableSections({style, matchUrl, strictRegexp, stopOnFirst: !asHash});
      if (asHash) {
        if (sections.length) {
          filtered[style.id] = sections;
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

  return asHash
    ? Object.assign({disableAll}, filtered)
    : filtered;
}


function saveStyle(style) {
  const id = Number(style.id) >= 0 ? Number(style.id) : null;
  const reason = style.reason;
  const notify = style.notify !== false;
  delete style.method;
  delete style.reason;
  delete style.notify;
  if (!style.name) {
    delete style.name;
  }
  let existed, codeIsUpdated;
  if (id !== null) {
    // Update or create
    style.id = id;
    return dbExec('get', id).then((event, store) => {
      const oldStyle = event.target.result;
      existed = Boolean(oldStyle);
      codeIsUpdated = !existed || style.sections && !styleSectionsEqual(style, oldStyle);
      style = Object.assign({}, oldStyle, style);
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
    }, style);
    return write(style);
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
    style.id = style.id || event.target.result;
    invalidateCache(existed ? {updated: style} : {added: style});
    compileStyleRegExps({style});
    if (notify) {
      notifyAllTabs({
        method: existed ? 'styleUpdated' : 'styleAdded',
        style, codeIsUpdated, reason,
      });
    }
    if (reason == 'update') {
      updateStyleDigest(style);
    } else if (reason == 'import') {
      chrome.storage.local.remove(DIGEST_KEY_PREFIX + style.id, ignoreChromeError);
    }
    return style;
  }
}


function deleteStyle({id, notify = true}) {
  id = Number(id);
  chrome.storage.local.remove(DIGEST_KEY_PREFIX + id, ignoreChromeError);
  return dbExec('delete', id).then(() => {
    invalidateCache({deletedId: id});
    if (notify) {
      notifyAllTabs({method: 'styleDeleted', id});
    }
    return id;
  });
}


function getApplicableSections({style, matchUrl, strictRegexp = true, stopOnFirst}) {
  if (!matchUrl.startsWith('http')
  && !matchUrl.startsWith('ftp')
  && !matchUrl.startsWith('file')
  && !matchUrl.startsWith(URLS.ownOrigin)) {
    return [];
  }
  const sections = [];
  for (const section of style.sections) {
    const {urls, domains, urlPrefixes, regexps, code} = section;
    if ((!urls.length && !urlPrefixes.length && !domains.length && !regexps.length
      || urls.length
        && urls.indexOf(matchUrl) >= 0
      || urlPrefixes.length
        && arraySomeIsPrefix(urlPrefixes, matchUrl)
      || domains.length
        && arraySomeIn(cachedStyles.urlDomains.get(matchUrl) || getDomains(matchUrl), domains)
      || regexps.length
        && arraySomeMatches(regexps, matchUrl, strictRegexp)
    ) && !styleCodeEmpty(code)) {
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
        const cacheKey = pass == 1 ? regexp : SLOPPY_REGEXP_PREFIX + regexp;
        let rx = cachedStyles.regexps.get(cacheKey);
        if (rx == false) {
          // invalid regexp
          break;
        }
        if (!rx) {
          const anchored = pass == 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
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
  // Collect the section if not empty or namespace-only.
  // We don't check long code as it's slow both for emptyCode declared as Object
  // and as Map in case the string is not the same reference used to add the item
  let isEmpty = code !== null &&
    code.length < 1000 &&
    cachedStyles.emptyCode.get(code);
  if (isEmpty !== undefined) {
    return isEmpty;
  }
  isEmpty = !code || !code.trim()
    || code.indexOf('@namespace') >= 0
    && code.replace(RX_CSS_COMMENTS, '').replace(RX_NAMESPACE, '').trim() == '';
  cachedStyles.emptyCode.set(code, isEmpty);
  return isEmpty;
}


function styleSectionsEqual({sections: a}, {sections: b}) {
  if (!a || !b) {
    return undefined;
  }
  if (a.length != b.length) {
    return false;
  }
  const checkedInB = [];
  return a.every(sectionA => b.some(sectionB => {
    if (!checkedInB.includes(sectionB) && propertiesEqual(sectionA, sectionB)) {
      checkedInB.push(sectionB);
      return true;
    }
  }));

  function propertiesEqual(secA, secB) {
    for (const name of ['urlPrefixes', 'urls', 'domains', 'regexps']) {
      if (!equalOrEmpty(secA[name], secB[name], 'every', arrayMirrors)) {
        return false;
      }
    }
    return equalOrEmpty(secA.code, secB.code, 'substr', (a, b) => a == b);
  }

  function equalOrEmpty(a, b, telltale, comparator) {
    const typeA = a && typeof a[telltale] == 'function';
    const typeB = b && typeof b[telltale] == 'function';
    return (
      (a === null || a === undefined || (typeA && !a.length)) &&
      (b === null || b === undefined || (typeB && !b.length))
    ) || typeA && typeB && a.length == b.length && comparator(a, b);
  }

  function arrayMirrors(array1, array2) {
    for (const el of array1) {
      if (array2.indexOf(el) < 0) {
        return false;
      }
    }
    for (const el of array2) {
      if (array1.indexOf(el) < 0) {
        return false;
      }
    }
    return true;
  }
}


function compileStyleRegExps({style, compileAll}) {
  const t0 = performance.now();
  for (const section of style.sections || []) {
    for (const regexp of section.regexps) {
      for (let pass = 1; pass <= (compileAll ? 2 : 1); pass++) {
        const cacheKey = pass == 1 ? regexp : SLOPPY_REGEXP_PREFIX + regexp;
        if (cachedStyles.regexps.has(cacheKey)) {
          continue;
        }
        // according to CSS4 @document specification the entire URL must match
        const anchored = pass == 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
        const rx = tryRegExp(anchored);
        cachedStyles.regexps.set(cacheKey, rx || false);
        if (!compileAll && performance.now() - t0 > 100) {
          return false;
        }
      }
    }
  }
  return true;
}


function invalidateCache({added, updated, deletedId} = {}) {
  if (!cachedStyles.list) {
    return;
  }
  const id = added ? added.id : updated ? updated.id : deletedId;
  const cached = cachedStyles.byId.get(id);
  if (updated) {
    if (cached) {
      Object.assign(cached, updated);
      cachedStyles.filters.clear();
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
    }
    return;
  }
  if (deletedId !== undefined) {
    if (cached) {
      const cachedIndex = cachedStyles.list.indexOf(cached);
      cachedStyles.list.splice(cachedIndex, 1);
      cachedStyles.byId.delete(deletedId);
      cachedStyles.filters.clear();
      return;
    }
  }
  cachedStyles.list = null;
  cachedStyles.filters.clear();
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
  if (url.indexOf('file:') == 0) {
    return [];
  }
  let d = /.*?:\/*([^/:]+)/.exec(url)[1];
  const domains = [d];
  while (d.indexOf('.') != -1) {
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


function getStyleDigests(style) {
  return Promise.all([
    chromeLocal.getValue(DIGEST_KEY_PREFIX + style.id),
    calcStyleDigest(style),
  ]);
}


function updateStyleDigest(style) {
  calcStyleDigest(style).then(digest =>
    chromeLocal.set({[DIGEST_KEY_PREFIX + style.id]: digest}));
}


function calcStyleDigest(style) {
  const jsonString = JSON.stringify(normalizeStyleSections(style));
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
