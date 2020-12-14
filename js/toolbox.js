'use strict';

define(require => {
  const ua = navigator.userAgent;
  const chromeApp = Boolean(chrome.app);
  const CHROME = chromeApp && parseInt(ua.match(/Chrom\w+\/(\d+)|$/)[1]);
  const OPERA = chromeApp && parseFloat(ua.match(/\bOPR\/(\d+\.\d+)|$/)[1]);
  const VIVALDI = chromeApp && ua.includes('Vivaldi');
  let FIREFOX = !chrome.app && parseFloat(ua.match(/\bFirefox\/(\d+\.\d+)|$/)[1]);
  // FF57+ supports openerTabId, but not in Android
  // (detecting FF57 by the feature it added, not navigator.ua which may be spoofed in about:config)
  const openerTabIdSupported = (!FIREFOX || window.AbortController) && chrome.windows != null;
  const debounceTimers = new Map();
  let URLS, deepCopy, deepEqual, deepMerge;

  /** @type {Toolbox} */
  const toolbox = /** @namespace Toolbox */ {

    CHROME,
    FIREFOX,
    OPERA,
    VIVALDI,
    CHROME_HAS_BORDER_BUG: CHROME >= 62 && CHROME <= 74,

    URLS: {
      ownOrigin: chrome.runtime.getURL(''),

      configureCommands:
        OPERA ? 'opera://settings/configureCommands'
              : 'chrome://extensions/configureCommands',

      installUsercss: chrome.runtime.getURL('install-usercss.html'),

      // CWS cannot be scripted in chromium, see ChromeExtensionsClient::IsScriptableURL
      // https://cs.chromium.org/chromium/src/chrome/common/extensions/chrome_extensions_client.cc
      browserWebStore:
        FIREFOX ? 'https://addons.mozilla.org/' :
        OPERA ? 'https://addons.opera.com/' :
          'https://chrome.google.com/webstore/',

      emptyTab: [
        // Chrome and simple forks
        'chrome://newtab/',
        // Opera
        'chrome://startpage/',
        // Vivaldi
        'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/startpage/startpage.html',
        // Firefox
        'about:home',
        'about:newtab',
      ],

      // Chrome 61.0.3161+ doesn't run content scripts on NTP https://crrev.com/2978953002/
      // TODO: remove when "minimum_chrome_version": "61" or higher
      chromeProtectsNTP: CHROME >= 61,

      uso: 'https://userstyles.org/',
      usoJson: 'https://userstyles.org/styles/chrome/',

      usoArchive: 'https://33kk.github.io/uso-archive/',
      usoArchiveRaw: 'https://raw.githubusercontent.com/33kk/uso-archive/flomaster/data/',
      extractUsoArchiveId: url =>
        url &&
        url.startsWith(URLS.usoArchiveRaw) &&
        parseInt(url.match(/\/(\d+)\.user\.css|$/)[1]),
      extractUsoArchiveInstallUrl: url => {
        const id = URLS.extractUsoArchiveId(url);
        return id ? `${URLS.usoArchive}?style=${id}` : '';
      },

      extractGreasyForkInstallUrl: url =>
        /^(https:\/\/(?:greasy|sleazy)fork\.org\/scripts\/\d+)[^/]*\/code\/[^/]*\.user\.css$|$/.exec(url)[1],

      supported: url => (
        url.startsWith('http') ||
        url.startsWith('ftp') ||
        url.startsWith('file') ||
        url.startsWith(URLS.ownOrigin) ||
        !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
      ),
    },

    /* A simple polyfill in case DOM storage is disabled in the browser */
    sessionStore: new Proxy({}, {
      get(target, name) {
        try {
          return sessionStorage[name];
        } catch (e) {
          Object.defineProperty(window, 'sessionStorage', {value: target});
        }
      },
      set(target, name, value, proxy) {
        try {
          sessionStorage[name] = `${value}`;
        } catch (e) {
          proxy[name]; // eslint-disable-line no-unused-expressions
          target[name] = `${value}`;
        }
        return true;
      },
      deleteProperty(target, name) {
        return delete target[name];
      },
    }),

    async activateTab(tab, {url, index, openerTabId} = {}) {
      const options = {active: true};
      if (url) {
        options.url = url;
      }
      if (openerTabId != null && openerTabIdSupported) {
        options.openerTabId = openerTabId;
      }
      await Promise.all([
        browser.tabs.update(tab.id, options),
        browser.windows && browser.windows.update(tab.windowId, {focused: true}),
        index != null && browser.tabs.move(tab.id, {index}),
      ]);
      return tab;
    },

    capitalize(s) {
      return s[0].toUpperCase() + s.slice(1);
    },

    async closeCurrentTab() {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1409375
      const tab = await browser.tabs.getCurrent();
      if (tab) chrome.tabs.remove(tab.id);
    },

    debounce(fn, delay, ...args) {
      const t = debounceTimers.get(fn);
      if (t) clearTimeout(t);
      debounceTimers.set(fn, setTimeout(debounceRun, delay, fn, ...args));
    },

    deepMerge(src, dst) {
      if (!src || typeof src !== 'object') {
        return src;
      }
      if (Array.isArray(src)) {
        // using `Array` that belongs to this `window`; not using Array.from as it's slower
        if (!dst) dst = Array.prototype.map.call(src, deepCopy);
        else for (const v of src) dst.push(deepCopy(v));
      } else {
        // using an explicit {} that belongs to this `window`
        if (!dst) dst = {};
        for (const [k, v] of Object.entries(src)) {
          dst[k] = deepCopy(v, dst[k]);
        }
      }
      return dst;
    },

    /** Useful in arr.map(deepCopy) to ignore the extra parameters passed by map() */
    deepCopy(src) {
      return deepMerge(src);
    },

    deepEqual(a, b, ignoredKeys) {
      if (!a || !b) return a === b;
      const type = typeof a;
      if (type !== typeof b) return false;
      if (type !== 'object') return a === b;
      if (Array.isArray(a)) {
        return Array.isArray(b) &&
               a.length === b.length &&
               a.every((v, i) => deepEqual(v, b[i], ignoredKeys));
      }
      for (const key in a) {
        if (!Object.hasOwnProperty.call(a, key) ||
            ignoredKeys && ignoredKeys.includes(key)) continue;
        if (!Object.hasOwnProperty.call(b, key)) return false;
        if (!deepEqual(a[key], b[key], ignoredKeys)) return false;
      }
      for (const key in b) {
        if (!Object.hasOwnProperty.call(b, key) ||
            ignoredKeys && ignoredKeys.includes(key)) continue;
        if (!Object.hasOwnProperty.call(a, key)) return false;
      }
      return true;
    },

    download(url, {
      method = 'GET',
      body,
      responseType = 'text',
      requiredStatusCode = 200,
      timeout = 60e3, // connection timeout, USO is that bad
      loadTimeout = 2 * 60e3, // data transfer timeout (counted from the first remote response)
      headers,
    } = {}) {
      /* USO can't handle POST requests for style json and XHR/fetch can't handle super long URL
       * so we need to collapse all long variables and expand them in the response */
      const queryPos = url.startsWith(URLS.uso) ? url.indexOf('?') : -1;
      if (queryPos >= 0) {
        if (body === undefined) {
          method = 'POST';
          body = url.slice(queryPos);
          url = url.slice(0, queryPos);
        }
        if (headers === undefined) {
          headers = {
            'Content-type': 'application/x-www-form-urlencoded',
          };
        }
      }
      const usoVars = [];
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const u = new URL(collapseUsoVars(url));
        const onTimeout = () => {
          xhr.abort();
          reject(new Error('Timeout fetching ' + u.href));
        };
        let timer = setTimeout(onTimeout, timeout);
        xhr.onreadystatechange = () => {
          if (xhr.readyState >= XMLHttpRequest.HEADERS_RECEIVED) {
            xhr.onreadystatechange = null;
            clearTimeout(timer);
            timer = loadTimeout && setTimeout(onTimeout, loadTimeout);
          }
        };
        xhr.onload = () =>
          xhr.status === requiredStatusCode || !requiredStatusCode || u.protocol === 'file:'
            ? resolve(expandUsoVars(xhr.response))
            : reject(xhr.status);
        xhr.onerror = () => reject(xhr.status);
        xhr.onloadend = () => clearTimeout(timer);
        xhr.responseType = responseType;
        xhr.open(method, u.href);
        for (const [name, value] of Object.entries(headers || {})) {
          xhr.setRequestHeader(name, value);
        }
        xhr.send(body);
      });

      function collapseUsoVars(url) {
        if (queryPos < 0 ||
            url.length < 2000 ||
            !url.startsWith(URLS.usoJson) ||
            !/^get$/i.test(method)) {
          return url;
        }
        const params = new URLSearchParams(url.slice(queryPos + 1));
        for (const [k, v] of params.entries()) {
          if (v.length < 10 || v.startsWith('ik-')) continue;
          usoVars.push(v);
          params.set(k, `\x01${usoVars.length}\x02`);
        }
        return url.slice(0, queryPos + 1) + params.toString();
      }

      function expandUsoVars(response) {
        if (!usoVars.length || !response) return response;
        const isText = typeof response === 'string';
        const json = isText && toolbox.tryJSONparse(response) || response;
        json.updateUrl = url;
        for (const section of json.sections || []) {
          const {code} = section;
          if (code.includes('\x01')) {
            section.code = code.replace(/\x01(\d+)\x02/g, (_, num) => usoVars[num - 1] || '');
          }
        }
        return isText ? JSON.stringify(json) : json;
      }
    },

    async findExistingTab({url, currentWindow, ignoreHash = true, ignoreSearch = false}) {
      url = new URL(url);
      const tabs = await browser.tabs.query({
        url: urlToMatchPattern(url, ignoreSearch),
        currentWindow,
      });
      return tabs.find(tab => {
        const tabUrl = new URL(tab.pendingUrl || tab.url);
        return tabUrl.protocol === url.protocol &&
          tabUrl.username === url.username &&
          tabUrl.password === url.password &&
          tabUrl.hostname === url.hostname &&
          tabUrl.port === url.port &&
          tabUrl.pathname === url.pathname &&
          (ignoreSearch || tabUrl.search === url.search) &&
          (ignoreHash || tabUrl.hash === url.hash);
      });
    },

    async getActiveTab() {
      return (await browser.tabs.query({currentWindow: true, active: true}))[0];
    },

    getOwnTab() {
      return browser.tabs.getCurrent();
    },

    getStyleWithNoCode(style) {
      const stripped = deepCopy(style);
      for (const section of stripped.sections) section.code = null;
      stripped.sourceCode = null;
      return stripped;
    },

    ignoreChromeError() {
      // eslint-disable-next-line no-unused-expressions
      chrome.runtime.lastError;
    },

    /**
     * Replaces empty tab (NTP or about:blank)
     * except when new URL is chrome:// or chrome-extension:// and the empty tab is in incognito
     */
    isTabReplaceable(tab, newUrl) {
      return tab &&
        URLS.emptyTab.includes(tab.pendingUrl || tab.url) &&
        !(tab.incognito && newUrl.startsWith('chrome'));
    },

    async openURL({
      url,
      index,
      openerTabId,
      active = true,
      currentWindow = true,
      newWindow,
    }) {
      if (!url.includes('://')) {
        url = chrome.runtime.getURL(url);
      }
      let tab = await toolbox.findExistingTab({url, currentWindow});
      if (tab) {
        return toolbox.activateTab(tab, {
          index,
          openerTabId,
          // when hash is different we can only set `url` if it has # otherwise the tab would reload
          url: url !== (tab.pendingUrl || tab.url) && url.includes('#') ? url : undefined,
        });
      }
      if (newWindow && browser.windows) {
        return (await browser.windows.create(Object.assign({url}, newWindow))).tabs[0];
      }
      tab = await toolbox.getActiveTab() || {url: ''};
      if (toolbox.isTabReplaceable(tab, url)) {
        return toolbox.activateTab(tab, {url, openerTabId});
      }
      const id = openerTabId == null ? tab.id : openerTabId;
      const opener = id != null && !tab.incognito && openerTabIdSupported && {openerTabId: id};
      return browser.tabs.create(Object.assign({url, index, active}, opener));
    },

    stringAsRegExp(s, flags, asString) {
      s = s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&');
      return asString ? s : new RegExp(s, flags);
    },

    /**
     * js engine can't optimize the entire function if it contains try-catch
     * so we should keep it isolated from normal code in a minimal wrapper
     * 2020 update: probably fixed at least in V8
     */
    tryCatch(func, ...args) {
      try {
        return func(...args);
      } catch (e) {}
    },

    tryJSONparse(jsonString) {
      try {
        return JSON.parse(jsonString);
      } catch (e) {}
    },

    tryRegExp(regexp, flags) {
      try {
        return new RegExp(regexp, flags);
      } catch (e) {}
    },
  };

  ({URLS, deepCopy, deepEqual, deepMerge} = toolbox);

  // see PR #781
  if (!CHROME && !chrome.browserAction.openPopup) {
    // in FF pre-57 legacy addons can override useragent so we assume the worst
    // until we know for sure in the async getBrowserInfo()
    // (browserAction.openPopup was added in 57)
    FIREFOX = browser.runtime.getBrowserInfo ? 51 : 50;
    // getBrowserInfo was added in FF 51
    Promise.resolve(FIREFOX >= 51 ? browser.runtime.getBrowserInfo() : {version: 50}).then(info => {
      FIREFOX = parseFloat(info.version);
      document.documentElement.classList.add('moz-appearance-bug', FIREFOX && FIREFOX < 54);
    });
  }

  if (!chrome.extension.getBackgroundPage || chrome.extension.getBackgroundPage() !== window) {
    const cls = FIREFOX ? 'firefox' : OPERA ? 'opera' : VIVALDI ? 'vivaldi' : '';
    if (cls) document.documentElement.classList.add(cls);
  }

  Object.assign(toolbox.debounce, {
    unregister(fn) {
      clearTimeout(debounceTimers.get(fn));
      debounceTimers.delete(fn);
    },
  });

  function debounceRun(fn, ...args) {
    debounceTimers.delete(fn);
    fn(...args);
  }

  function urlToMatchPattern(url, ignoreSearch) {
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
    if (!/^(http|https|ws|wss|ftp|data|file)$/.test(url.protocol)) {
      return undefined;
    }
    if (ignoreSearch) {
      return [
        `${url.protocol}//${url.hostname}/${url.pathname}`,
        `${url.protocol}//${url.hostname}/${url.pathname}?*`,
      ];
    }
    // FIXME: is %2f allowed in pathname and search?
    return `${url.protocol}//${url.hostname}/${url.pathname}${url.search}`;
  }

  return toolbox;
});
