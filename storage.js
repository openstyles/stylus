/* global cachedStyles: true, prefs: true, contextMenus: false */
/* global handleUpdate, handleDelete */
'use strict';

function getDatabase(ready, error) {
  const dbOpenRequest = window.indexedDB.open('stylish', 2);
  dbOpenRequest.onsuccess = event => {
    ready(event.target.result);
  };
  dbOpenRequest.onerror = event => {
    console.warn(event.target.errorCode);
    if (error) {
      error(event);
    }
  };
  dbOpenRequest.onupgradeneeded = event => {
    if (event.oldVersion == 0) {
      event.target.result.createObjectStore('styles', {
        keyPath: 'id',
        autoIncrement: true,
      });
    }
  };
}


// Let manage/popup/edit reuse background page variables
// Note, only 'var'-declared variables are visible from another extension page
// eslint-disable-next-line no-var
var cachedStyles, prefs;
(() => {
  const bg = chrome.extension.getBackgroundPage();
  cachedStyles = bg && bg.cachedStyles || {
    bg,
    list: null,
    noCode: null,
    byId: new Map(),
    filters: new Map(),
    regexps: new Map(),
    urlDomains: new Map(),
    mutex: {
      inProgress: false,
      onDone: [],
    },
  };
  prefs = bg && bg.prefs;
})();


// in case Chrome haven't yet loaded the bg page and displays our page like edit/manage
function getStylesSafe(options) {
  return new Promise(resolve => {
    if (cachedStyles.bg) {
      getStyles(options, resolve);
      return;
    }
    chrome.runtime.sendMessage(Object.assign({method: 'getStyles'}, options), styles => {
      if (!styles) {
        resolve(getStylesSafe(options));
      } else {
        cachedStyles = chrome.extension.getBackgroundPage().cachedStyles;
        resolve(styles);
      }
    });
  });
}


function getStyles(options, callback) {
  if (cachedStyles.list) {
    callback(filterStyles(options));
    return;
  }
  if (cachedStyles.mutex.inProgress) {
    cachedStyles.mutex.onDone.push({options, callback});
    return;
  }
  cachedStyles.mutex.inProgress = true;

  //const t0 = performance.now();
  getDatabase(db => {
    const tx = db.transaction(['styles'], 'readonly');
    const os = tx.objectStore('styles');
    os.getAll().onsuccess = event => {
      cachedStyles.list = event.target.result || [];
      cachedStyles.noCode = [];
      cachedStyles.byId.clear();
      for (const style of cachedStyles.list) {
        const noCode = getStyleWithNoCode(style);
        cachedStyles.noCode.push(noCode);
        cachedStyles.byId.set(style.id, {style, noCode});
        compileStyleRegExps(style);
      }
      //console.log('%s getStyles %s, invoking cached callbacks: %o', (performance.now() - t0).toFixed(1), JSON.stringify(options), cachedStyles.mutex.onDone.map(e => JSON.stringify(e.options)))
      callback(filterStyles(options));

      cachedStyles.mutex.inProgress = false;
      for (const {options, callback} of cachedStyles.mutex.onDone) {
        callback(filterStyles(options));
      }
      cachedStyles.mutex.onDone = [];
    };
  }, null);
}


function getStyleWithNoCode(style) {
  const stripped = Object.assign({}, style, {sections: []});
  for (const section of style.sections) {
    stripped.sections.push(Object.assign({}, section, {code: null}));
  }
  return stripped;
}


function invalidateCache(andNotify, {added, updated, deletedId} = {}) {
  // prevent double-add on echoed invalidation
  const cached = added && cachedStyles.byId.get(added.id);
  if (cached) {
    return;
  }
  if (andNotify) {
    chrome.runtime.sendMessage({method: 'invalidateCache', added, updated, deletedId});
  }
  if (!cachedStyles.list) {
    return;
  }
  if (updated) {
    const cached = cachedStyles.byId.get(updated.id);
    if (cached) {
      Object.assign(cached.style, updated);
      Object.assign(cached.noCode, getStyleWithNoCode(updated));
      //console.log('cache: updated', updated);
    }
    cachedStyles.filters.clear();
    return;
  }
  if (added) {
    const noCode = getStyleWithNoCode(added);
    cachedStyles.list.push(added);
    cachedStyles.noCode.push(noCode);
    cachedStyles.byId.set(added.id, {style: added, noCode});
    //console.log('cache: added', added);
    cachedStyles.filters.clear();
    return;
  }
  if (deletedId != undefined) {
    const deletedStyle = (cachedStyles.byId.get(deletedId) || {}).style;
    if (deletedStyle) {
      const cachedIndex = cachedStyles.list.indexOf(deletedStyle);
      cachedStyles.list.splice(cachedIndex, 1);
      cachedStyles.noCode.splice(cachedIndex, 1);
      cachedStyles.byId.delete(deletedId);
      //console.log('cache: deleted', deletedStyle);
      cachedStyles.filters.clear();
      return;
    }
  }
  cachedStyles.list = null;
  cachedStyles.noCode = null;
  //console.log('cache cleared');
  cachedStyles.filters.clear();
}


function filterStyles(options = {}) {
  //const t0 = performance.now();
  const enabled = fixBoolean(options.enabled);
  const url = 'url' in options ? options.url : null;
  const id = 'id' in options ? Number(options.id) : null;
  const matchUrl = 'matchUrl' in options ? options.matchUrl : null;
  const code = 'code' in options ? options.code : true;
  const asHash = 'asHash' in options ? options.asHash : false;

  if (enabled === null
    && url === null
    && id === null
    && matchUrl === null
    && asHash != true) {
    //console.log('%c%s filterStyles SKIPPED LOOP %s', 'color:gray', (performance.now() - t0).toFixed(1), JSON.stringify(options))
    return code ? cachedStyles.list : cachedStyles.noCode;
  }
  // silence the inapplicable warning for async code
  // eslint-disable-next-line no-use-before-define
  const disableAll = asHash && prefs.get('disableAll', false);

  // add \t after url to prevent collisions (not sure it can actually happen though)
  const cacheKey = ' ' + enabled + url + '\t' + id + matchUrl + '\t' + code + asHash;
  const cached = cachedStyles.filters.get(cacheKey);
  if (cached) {
    //console.log('%c%s filterStyles REUSED RESPONSE %s', 'color:gray', (performance.now() - t0).toFixed(1), JSON.stringify(options))
    cached.hits++;
    cached.lastHit = Date.now();

    return asHash
      ? Object.assign({disableAll}, cached.styles)
      : cached.styles;
  }

  if (matchUrl && !cachedStyles.urlDomains.has(matchUrl)) {
    cachedStyles.urlDomains.set(matchUrl, getDomains(matchUrl));
    for (let i = cachedStyles.urlDomains.size - 100; i > 0; i--) {
      const firstKey = cachedStyles.urlDomains.keys().next().value;
      cachedStyles.urlDomains.delete(firstKey);
    }
  }

  const styles = id === null
    ? (code ? cachedStyles.list : cachedStyles.noCode)
    : [(cachedStyles.byId.get(id) || {})[code ? 'style' : 'noCode']];
  const filtered = asHash ? {} : [];
  if (!styles) {
    // may happen when users [accidentally] reopen an old URL
    // of edit.html with a non-existent style id parameter
    return filtered;
  }
  for (let i = 0, style; (style = styles[i]); i++) {
    if ((enabled === null || style.enabled == enabled)
      && (url === null || style.url == url)
      && (id === null || style.id == id)) {
      const sections = (asHash || matchUrl !== null) && getApplicableSections(style, matchUrl);
      if (asHash) {
        if (sections.length) {
          filtered[style.id] = sections;
        }
      } else if (matchUrl === null || sections.length) {
        filtered.push(style);
      }
    }
  }
  //console.log('%s filterStyles %s', (performance.now() - t0).toFixed(1), JSON.stringify(options))
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


function cleanupCachedFilters({force = false} = {}) {
  if (!force) {
    // sliding timer for 1 second
    clearTimeout(cleanupCachedFilters.timeout);
    cleanupCachedFilters.timeout = setTimeout(cleanupCachedFilters, 1000, {force: true});
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
  cleanupCachedFilters.timeout = 0;
}


function saveStyle(style) {
  return new Promise(resolve => {
    getDatabase(db => {
      const tx = db.transaction(['styles'], 'readwrite');
      const os = tx.objectStore('styles');

      const id = style.id !== undefined && style.id !== null ? Number(style.id) : null;
      const reason = style.reason;
      const notify = style.notify !== false;
      delete style.method;
      delete style.reason;
      delete style.notify;
      if (!style.name) {
        delete style.name;
      }

      // Update
      if (id !== null) {
        style.id = id;
        os.get(id).onsuccess = eventGet => {
          const existed = Boolean(eventGet.target.result);
          const oldStyle = Object.assign({}, eventGet.target.result);
          const codeIsUpdated = 'sections' in style && !styleSectionsEqual(style, oldStyle);
          style = Object.assign(oldStyle, style);
          addMissingStyleTargets(style);
          os.put(style).onsuccess = eventPut => {
            style.id = style.id || eventPut.target.result;
            invalidateCache(notify, existed ? {updated: style} : {added: style});
            compileStyleRegExps(style);
            if (notify) {
              notifyAllTabs({
                method: existed ? 'styleUpdated' : 'styleAdded',
                style, codeIsUpdated, reason,
              });
            }
            if (typeof handleUpdate != 'undefined') {
              handleUpdate(style, {reason});
            }
            resolve(style);
          };
        };
        return;
      }

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
      addMissingStyleTargets(style);
      os.add(style).onsuccess = event => {
        // Give it the ID that was generated
        style.id = event.target.result;
        invalidateCache(notify, {added: style});
        compileStyleRegExps(style);
        if (notify) {
          notifyAllTabs({method: 'styleAdded', style, reason});
        }
        if (typeof handleUpdate != 'undefined') {
          handleUpdate(style, {reason});
        }
        resolve(style);
      };
    });
  });
}


function addMissingStyleTargets(style) {
  style.sections = (style.sections || []).map(section =>
    Object.assign({
      urls: [],
      urlPrefixes: [],
      domains: [],
      regexps: [],
    }, section)
  );
}


function enableStyle(id, enabled) {
  return saveStyle({id, enabled});
}


function deleteStyle(id, {notify = true} = {}) {
  return new Promise(resolve =>
    getDatabase(db => {
      const tx = db.transaction(['styles'], 'readwrite');
      const os = tx.objectStore('styles');
      os.delete(Number(id)).onsuccess = () => {
        invalidateCache(notify, {deletedId: id});
        if (notify) {
          notifyAllTabs({method: 'styleDeleted', id});
        }
        if (typeof handleDelete != 'undefined') {
          handleDelete(id);
        }
        resolve(id);
      };
    }));
}


function reportError(...args) {
  for (const arg of args) {
    if ('message' in arg) {
      console.log(arg.message);
    }
  }
}


function fixBoolean(b) {
  if (typeof b != 'undefined') {
    return b != 'false';
  }
  return null;
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


function getType(o) {
  if (typeof o == 'undefined' || typeof o == 'string') {
    return typeof o;
  }
  // with the persistent cachedStyles the Array reference is usually different
  // so let's check for e.g. type of 'every' which is only present on arrays
  // (in the context of our extension)
  if (o instanceof Array || typeof o.every == 'function') {
    return 'array';
  }
  console.warn('Unsupported type:', o);
  return 'undefined';
}

const namespacePattern = /^\s*(@namespace[^;]+;\s*)+$/;

function getApplicableSections(style, url) {
  const sections = [];
  for (const section of style.sections) {
    if (sectionAppliesToUrl(section, url)) {
      sections.push(section);
    }
  }
  // ignore if it's just namespaces
  if (sections.length == 1 && namespacePattern.test(sections[0].code)) {
    return [];
  }
  return sections;
}


function sectionAppliesToUrl(section, url) {
  // only http, https, file, ftp, and chrome-extension://OWN_EXTENSION_ID allowed
  if (!url.startsWith('http')
  && !url.startsWith('ftp')
  && !url.startsWith('file')
  && !url.startsWith(OWN_ORIGIN)) {
    return false;
  }
  if (section.urls.length == 0
  && section.domains.length == 0
  && section.urlPrefixes.length == 0
  && section.regexps.length == 0) {
    return true;
  }
  if (section.urls.indexOf(url) != -1) {
    return true;
  }
  for (const urlPrefix of section.urlPrefixes) {
    if (url.startsWith(urlPrefix)) {
      return true;
    }
  }
  const urlDomains = cachedStyles.urlDomains.get(url) || getDomains(url);
  for (const domain of urlDomains) {
    if (section.domains.indexOf(domain) != -1) {
      return true;
    }
  }
  for (const regexp of section.regexps) {
    let rx = cachedStyles.regexps.get(regexp);
    if (rx == false) {
      // bad regexp
      continue;
    }
    if (!rx) {
      rx = tryRegExp('^(?:' + regexp + ')$');
      cachedStyles.regexps.set(regexp, rx || false);
      if (!rx) {
        // bad regexp
        continue;
      }
    }
    if (rx.test(url)) {
      return true;
    }
  }
  return false;
}


function isCheckbox(el) {
  return el.localName == 'input' && el.type == 'checkbox';
}


// js engine can't optimize the entire function if it contains try-catch
// so we should keep it isolated from normal code in a minimal wrapper
// Update: might get fixed in V8 TurboFan in the future
function runTryCatch(func, ...args) {
  try {
    return func(...args);
  } catch (e) {}
}


function tryRegExp(regexp) {
  try {
    return new RegExp(regexp);
  } catch (e) {}
}


prefs = prefs || new function Prefs() {
  const me = this;

  const defaults = {
    'openEditInWindow': false,      // new editor opens in a own browser window
    'windowPosition': {},           // detached window position
    'show-badge': true,             // display text on popup menu icon
    'disableAll': false,            // boss key

    'popup.breadcrumbs': true,      // display 'New style' links as URL breadcrumbs
    'popup.breadcrumbs.usePath': false, // use URL path for 'this URL'
    'popup.enabledFirst': true,     // display enabled styles before disabled styles
    'popup.stylesFirst': true,      // display enabled styles before disabled styles

    'manage.onlyEnabled': false,    // display only enabled styles
    'manage.onlyEdited': false,     // display only styles created locally

    'editor.options': {},           // CodeMirror.defaults.*
    'editor.lineWrapping': true,    // word wrap
    'editor.smartIndent': true,     // 'smart' indent
    'editor.indentWithTabs': false, // smart indent with tabs
    'editor.tabSize': 4,            // tab width, in spaces
    'editor.keyMap': navigator.appVersion.indexOf('Windows') > 0 ? 'sublime' : 'default',
    'editor.theme': 'default',      // CSS theme
    'editor.beautify': {            // CSS beautifier
      selector_separator_newline: true,
      newline_before_open_brace: false,
      newline_after_open_brace: true,
      newline_between_properties: true,
      newline_before_close_brace: true,
      newline_between_rules: false,
      end_with_newline: false
    },
    'editor.lintDelay': 500,        // lint gutter marker update delay, ms
    'editor.lintReportDelay': 4500, // lint report update delay, ms

    'badgeDisabled': '#8B0000',     // badge background color when disabled
    'badgeNormal': '#006666',       // badge background color

    'popupWidth': 240,              // popup width in pixels

    'updateInterval': 0             // user-style automatic update interval, hour
  };
  const values = deepCopy(defaults);

  let syncTimeout; // see broadcast() function below

  Object.defineProperty(this, 'readOnlyValues', {value: {}});

  Prefs.prototype.get = function(key, defaultValue) {
    if (key in values) {
      return values[key];
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    if (key in defaults) {
      return defaults[key];
    }
    console.warn("No default preference for '%s'", key);
  };

  Prefs.prototype.getAll = function() {
    return deepCopy(values);
  };

  Prefs.prototype.set = function(key, value, options) {
    const oldValue = deepCopy(values[key]);
    values[key] = value;
    defineReadonlyProperty(this.readOnlyValues, key, value);
    if ((!options || !options.noBroadcast) && !equal(value, oldValue)) {
      me.broadcast(key, value, options);
    }
  };

  Prefs.prototype.remove = key => me.set(key, undefined);

  Prefs.prototype.broadcast = function(key, value, options) {
    const message = {method: 'prefChanged', prefName: key, value: value};
    notifyAllTabs(message);
    chrome.runtime.sendMessage(message);
    if (key == 'disableAll') {
      notifyAllTabs({method: 'styleDisableAll', disableAll: value});
    }
    if (!options || !options.noSync) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(function() {
        getSync().set({'settings': values});
      }, 0);
    }
  };

  Object.keys(defaults).forEach(function(key) {
    me.set(key, defaults[key], {noBroadcast: true});
  });

  getSync().get('settings', function(result) {
    const synced = result.settings;
    for (const key in defaults) {
      if (synced && (key in synced)) {
        me.set(key, synced[key], {noSync: true});
      } else {
        const value = tryMigrating(key);
        if (value !== undefined) {
          me.set(key, value);
        }
      }
    }
    if (typeof contextMenus !== 'undefined') {
      for (const id in contextMenus) {
        if (typeof values[id] == 'boolean') {
          me.broadcast(id, values[id], {noSync: true});
        }
      }
    }
  });

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area == 'sync' && 'settings' in changes) {
      const synced = changes.settings.newValue;
      if (synced) {
        for (const key in defaults) {
          if (key in synced) {
            me.set(key, synced[key], {noSync: true});
          }
        }
      } else {
        // user manually deleted our settings, we'll recreate them
        getSync().set({'settings': values});
      }
    }
  });

  function tryMigrating(key) {
    if (!(key in localStorage)) {
      return undefined;
    }
    const value = localStorage[key];
    delete localStorage[key];
    localStorage['DEPRECATED: ' + key] = value;
    switch (typeof defaults[key]) {
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'number':
        return Number(value);
      case 'object':
        try {
          return JSON.parse(value);
        } catch (e) {
          console.log("Cannot migrate from localStorage %s = '%s': %o", key, value, e);
          return undefined;
        }
    }
    return value;
  }
}();


// Accepts an array of pref names (values are fetched via prefs.get)
// and establishes a two-way connection between the document elements and the actual prefs
function setupLivePrefs(IDs) {
  const localIDs = {};
  IDs.forEach(function(id) {
    localIDs[id] = true;
    updateElement(id).addEventListener('change', function() {
      prefs.set(this.id, isCheckbox(this) ? this.checked : this.value);
    });
  });
  chrome.runtime.onMessage.addListener(function(request) {
    if (request.prefName in localIDs) {
      updateElement(request.prefName);
    }
  });
  function updateElement(id) {
    const el = document.getElementById(id);
    el[isCheckbox(el) ? 'checked' : 'value'] = prefs.get(id);
    el.dispatchEvent(new Event('change', {bubbles: true, cancelable: true}));
    return el;
  }
}


function getCodeMirrorThemes(callback) {
  chrome.runtime.getPackageDirectoryEntry(function(rootDir) {
    rootDir.getDirectory('codemirror/theme', {create: false}, function(themeDir) {
      themeDir.createReader().readEntries(function(entries) {
        const themes = [chrome.i18n.getMessage('defaultTheme')];
        entries
          .filter(entry => entry.isFile)
          .sort((a, b) => (a.name < b.name ? -1 : 1))
          .forEach(function(entry) {
            themes.push(entry.name.replace(/\.css$/, ''));
          });
        if (callback) {
          callback(themes);
        }
      });
    });
  });
}


function sessionStorageHash(name) {
  return {
    name,
    value: runTryCatch(JSON.parse, sessionStorage[name]) || {},
    set(k, v) {
      this.value[k] = v;
      this.updateStorage();
    },
    unset(k) {
      delete this.value[k];
      this.updateStorage();
    },
    updateStorage() {
      sessionStorage[this.name] = JSON.stringify(this.value);
    }
  };
}


function deepCopy(obj) {
  if (!obj || typeof obj != 'object') {
    return obj;
  } else {
    const emptyCopy = Object.create(Object.getPrototypeOf(obj));
    return deepMerge(emptyCopy, obj);
  }
}


function deepMerge(target, ...args) {
  for (const obj of args) {
    for (const k in obj) {
      const value = obj[k];
      if (!value || typeof value != 'object') {
        target[k] = value;
      } else if (k in target) {
        deepMerge(target[k], value);
      } else if (typeof value.slice == 'function') {
        target[k] = value.slice();
      } else {
        target[k] = deepCopy(value);
      }
    }
  }
  return target;
}


function equal(a, b) {
  if (!a || !b || typeof a != 'object' || typeof b != 'object') {
    return a === b;
  }
  if (Object.keys(a).length != Object.keys(b).length) {
    return false;
  }
  for (const k in a) {
    if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}


function defineReadonlyProperty(obj, key, value) {
  const copy = deepCopy(value);
  if (typeof copy == 'object') {
    Object.freeze(copy);
  }
  Object.defineProperty(obj, key, {value: copy, configurable: true});
}

// Polyfill for Firefox < 53 https://bugzilla.mozilla.org/show_bug.cgi?id=1220494
function getSync() {
  if ('sync' in chrome.storage) {
    return chrome.storage.sync;
  }
  const crappyStorage = {};
  return {
    get(key, callback) {
      callback(crappyStorage[key] || {});
    },
    set(source, callback) {
      for (const property in source) {
        if (source.hasOwnProperty(property)) {
          crappyStorage[property] = source[property];
        }
      }
      callback();
    }
  };
}


function styleSectionsEqual(styleA, styleB) {
  if (!styleA.sections || !styleB.sections) {
    return undefined;
  }
  if (styleA.sections.length != styleB.sections.length) {
    return false;
  }
  const propNames = ['code', 'urlPrefixes', 'urls', 'domains', 'regexps'];
  const typeBcaches = [];
  checkingEveryInA:
  for (const sectionA of styleA.sections) {
    const typeAcache = new Map();
    for (const name of propNames) {
      typeAcache.set(name, getType(sectionA[name]));
    }
    lookingForDupeInB:
    for (let i = 0, sectionB; (sectionB = styleB.sections[i]); i++) {
      const typeBcache = typeBcaches[i] = typeBcaches[i] || new Map();
      comparingProps:
      for (const name of propNames) {
        const propA = sectionA[name];
        const typeA = typeAcache.get(name);
        const propB = sectionB[name];
        let typeB = typeBcache.get(name);
        if (!typeB) {
          typeB = getType(propB);
          typeBcache.set(name, typeB);
        }
        if (typeA != typeB) {
          const bothEmptyOrUndefined =
            (typeA == 'undefined' || (typeA == 'array' && propA.length == 0)) &&
            (typeB == 'undefined' || (typeB == 'array' && propB.length == 0));
          if (bothEmptyOrUndefined) {
            continue comparingProps;
          } else {
            continue lookingForDupeInB;
          }
        }
        if (typeA == 'undefined') {
          continue comparingProps;
        }
        if (typeA == 'array') {
          if (propA.length != propB.length) {
            continue lookingForDupeInB;
          }
          for (const item of propA) {
            if (propB.indexOf(item) < 0) {
              continue lookingForDupeInB;
            }
          }
          continue comparingProps;
        }
        if (typeA == 'string' && propA != propB) {
          continue lookingForDupeInB;
        }
      }
      // dupe found
      continue checkingEveryInA;
    }
    // dupe not found
    return false;
  }
  return true;
}


function compileStyleRegExps(style) {
  const t0 = performance.now();
  for (const section of style.sections || []) {
    for (const regexp of section.regexps) {
      // we want to match the full url, so add ^ and $ if not already present
      if (cachedStyles.regexps.has(regexp)) {
        continue;
      }
      const rx = tryRegExp('^(?:' + regexp + ')$');
      cachedStyles.regexps.set(regexp, rx || false);
      if (performance.now() - t0 > 100) {
        return;
      }
    }
  }
}
