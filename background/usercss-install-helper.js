/* global
  API
  download
  openURL
  tabManager
  URLS
*/
'use strict';

(() => {
  const installCodeCache = {};
  const clearInstallCode = url => delete installCodeCache[url];
  /** Sites may be using custom types like text/stylus so this coarse filter only excludes html */
  const isContentTypeText = type => /^text\/(?!html)/i.test(type);

  // in Firefox we have to use a content script to read file://
  const fileLoader = !chrome.app && (
    async tabId =>
      (await browser.tabs.executeScript(tabId, {file: '/content/install-hook-usercss.js'}))[0]);

  const urlLoader =
    async (tabId, url) => (
      url.startsWith('file:') ||
      tabManager.get(tabId, isContentTypeText.name) ||
      isContentTypeText((await fetch(url, {method: 'HEAD'})).headers.get('content-type'))
    ) && download(url);

  API.usercss.getInstallCode = url => {
    // when the installer tab is reloaded after the cache is expired, this will throw intentionally
    const {code, timer} = installCodeCache[url];
    clearInstallCode(url);
    clearTimeout(timer);
    return code;
  };

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

  // Faster installation on known distribution sites to avoid flicker of css text
  chrome.webRequest.onBeforeSendHeaders.addListener(({tabId, url}) => {
    const u = new URL(url);
    const m = maybeDistro[u.hostname];
    if (!m || m.rx.test(u.pathname)) {
      openInstallerPage(tabId, url, {});
      // Silently suppress navigation.
      // Don't redirect to the install URL as it'll flash the text!
      return {redirectUrl: 'javascript:void 0'}; // eslint-disable-line no-script-url
    }
  }, {
    urls: [
      URLS.usoArchiveRaw + 'usercss/*.user.css',
      '*://greasyfork.org/scripts/*/code/*.user.css',
      '*://sleazyfork.org/scripts/*/code/*.user.css',
      ...[].concat(
        ...Object.entries(maybeDistro)
          .map(([host, {glob}]) => makeUsercssGlobs(host, glob))),
    ],
    types: ['main_frame'],
  }, ['blocking']);

  // Remember Content-Type to avoid re-fetching of the headers in urlLoader as it can be very slow
  chrome.webRequest.onHeadersReceived.addListener(({tabId, responseHeaders}) => {
    const h = responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
    tabManager.set(tabId, isContentTypeText.name, h && isContentTypeText(h.value) || undefined);
  }, {
    urls: makeUsercssGlobs('*', '/*'),
    types: ['main_frame'],
  }, ['responseHeaders']);

  tabManager.onUpdate(async ({tabId, url, oldUrl = ''}) => {
    if (url.includes('.user.') &&
        /^(https?|file|ftps?):/.test(url) &&
        /\.user\.(css|styl)$/.test(url.split(/[#?]/, 1)[0]) &&
        !oldUrl.startsWith(URLS.installUsercss)) {
      const inTab = url.startsWith('file:') && Boolean(fileLoader);
      const code = await (inTab ? fileLoader : urlLoader)(tabId, url);
      if (/==userstyle==/i.test(code) && !/^\s*</.test(code)) {
        openInstallerPage(tabId, url, {code, inTab});
      }
    }
  });

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

  function makeUsercssGlobs(host, path) {
    return '%css,%css?*,%styl,%styl?*'.replace(/%/g, `*://${host}${path}.user.`).split(',');
  }
})();
