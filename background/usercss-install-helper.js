/* global RX_META URLS download openURL */// toolbox.js
/* global addAPI bgReady */// common.js
/* global tabMan */// msg.js
'use strict';

bgReady.all.then(() => {
  const installCodeCache = {};

  addAPI(/** @namespace API */ {
    usercss: {
      getInstallCode(url) {
        // when the installer tab is reloaded after the cache is expired, this will throw intentionally
        const {code, timer} = installCodeCache[url];
        clearInstallCode(url);
        clearTimeout(timer);
        return code;
      },
    },
  });

  // `glob`: pathname match pattern for webRequest
  // `rx`: pathname regex to verify the URL really looks like a raw usercss
  const maybeDistro = {
    // https://github.com/StylishThemes/GitHub-Dark/raw/master/github-dark.user.css
    'github.com': {
      glob: '/*/raw/*',
      rx: /^\/[^/]+\/[^/]+\/raw\/[^/]+\/[^/]+?\.user\.(css|styl)$/,
    },
    // https://raw.githubusercontent.com/StylishThemes/GitHub-Dark/master/github-dark.user.css
    'raw.githubusercontent.com': {
      glob: '/*',
      rx: /^(\/[^/]+?){4}\.user\.(css|styl)$/,
    },
  };

  chrome.webRequest.onBeforeSendHeaders.addListener(maybeInstallFromDistro, {
    urls: [
      URLS.usw + 'api/style/*.user.css',
      ...URLS.usoArchiveRaw.map(s => s + 'usercss/*.user.css'),
      ...['greasy', 'sleazy'].map(s => `*://${s}fork.org/scripts/*/code/*.user.css`),
      ...[].concat(
        ...Object.entries(maybeDistro)
          .map(([host, {glob}]) => makeUsercssGlobs(host, glob))),
    ],
    types: ['main_frame'],
  }, ['blocking']);

  chrome.webRequest.onHeadersReceived.addListener(rememberContentType, {
    urls: makeUsercssGlobs('*', '/*'),
    types: ['main_frame'],
  }, ['responseHeaders']);

  tabMan.onUpdate(maybeInstall);

  function clearInstallCode(url) {
    return delete installCodeCache[url];
  }

  /** Sites may be using custom types like text/stylus so this coarse filter only excludes html */
  function isContentTypeText(type) {
    return /^text\/(?!html)/i.test(type);
  }

  // in Firefox we have to use a content script to read file://
  async function loadFromFile(tabId) {
    return (await browser.tabs.executeScript(tabId, {file: '/content/install-hook-usercss.js'}))[0];
  }

  async function loadFromUrl(tabId, url) {
    return (
      url.startsWith('file:') ||
      tabMan.get(tabId, isContentTypeText.name) ||
      isContentTypeText((await fetch(url, {method: 'HEAD'})).headers.get('content-type'))
    ) && download(url);
  }

  function makeUsercssGlobs(host, path) {
    return '%css,%css?*,%styl,%styl?*'.replace(/%/g, `*://${host}${path}.user.`).split(',');
  }

  async function maybeInstall({tabId, url, oldUrl = ''}) {
    if (url.includes('.user.') &&
        /^(https?|file|ftps?):/.test(url) &&
        /\.user\.(css|styl)$/.test(url.split(/[#?]/, 1)[0]) &&
        !oldUrl.startsWith(URLS.installUsercss)) {
      const inTab = url.startsWith('file:') && !chrome.app;
      const code = await (inTab ? loadFromFile : loadFromUrl)(tabId, url);
      if (!/^\s*</.test(code) && RX_META.test(code)) {
        openInstallerPage(tabId, url, {code, inTab});
      }
    }
  }

  /** Faster installation on known distribution sites to avoid flicker of css text */
  function maybeInstallFromDistro({tabId, url}) {
    const u = new URL(url);
    const m = maybeDistro[u.hostname];
    if (!m || m.rx.test(u.pathname)) {
      openInstallerPage(tabId, url, {});
      // Silently suppress navigation.
      // Don't redirect to the install URL as it'll flash the text!
      return {redirectUrl: 'javascript:void 0'}; // eslint-disable-line no-script-url
    }
  }

  function openInstallerPage(tabId, url, {code, inTab} = {}) {
    const newUrl = `${URLS.installUsercss}?updateUrl=${encodeURIComponent(url)}`;
    if (inTab) {
      browser.tabs.get(tabId).then(tab =>
        openURL({
          url: `${newUrl}&tabId=${tabId}`,
          active: tab.active,
          index: tab.index + 1,
          openerTabId: tabId,
          currentWindow: null,
        }));
    } else {
      const timer = setTimeout(clearInstallCode, 10e3, url);
      installCodeCache[url] = {code, timer};
      chrome.tabs.update(tabId, {url: newUrl});
    }
  }

  /** Remember Content-Type to avoid wasting time to re-fetch in loadFromUrl **/
  function rememberContentType({tabId, responseHeaders}) {
    const h = responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
    tabMan.set(tabId, isContentTypeText.name, h && isContentTypeText(h.value) || undefined);
  }
});
