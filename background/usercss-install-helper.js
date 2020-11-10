/* global API_METHODS openURL download URLS tabManager */
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

  API_METHODS.getUsercssInstallCode = url => {
    // when the installer tab is reloaded after the cache is expired, this will throw intentionally
    const {code, timer} = installCodeCache[url];
    clearInstallCode(url);
    clearTimeout(timer);
    return code;
  };

  // Faster installation on known distribution sites to avoid flicker of css text
  chrome.webRequest.onBeforeSendHeaders.addListener(({tabId, url}) => {
    openInstallerPage(tabId, url, {});
    // Silently suppressing navigation like it never happened
    return {redirectUrl: 'javascript:void 0'}; // eslint-disable-line no-script-url
  }, {
    urls: [
      URLS.usoArchiveRaw + 'usercss/*.user.css',
      '*://greasyfork.org/scripts/*/code/*.user.css',
      '*://sleazyfork.org/scripts/*/code/*.user.css',
    ],
    types: ['main_frame'],
  }, ['blocking']);

  // Remember Content-Type to avoid re-fetching of the headers in urlLoader as it can be very slow
  chrome.webRequest.onHeadersReceived.addListener(({tabId, responseHeaders}) => {
    const h = responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
    tabManager.set(tabId, isContentTypeText.name, h && isContentTypeText(h.value) || undefined);
  }, {
    urls: '%css,%css?*,%styl,%styl?*'.replace(/%/g, '*://*/*.user.').split(','),
    types: ['main_frame'],
  }, ['responseHeaders']);

  tabManager.onUpdate(async ({tabId, url, oldUrl = ''}) => {
    if (url.includes('.user.') &&
        /^(https?|file|ftps?):/.test(url) &&
        /\.user\.(css|styl)$/.test(url.split(/[#?]/, 1)[0]) &&
        !oldUrl.startsWith(URLS.installUsercss)) {
      const inTab = url.startsWith('file:') && Boolean(fileLoader);
      const code = await (inTab ? fileLoader : urlLoader)(tabId, url);
      if (/==userstyle==/i.test(code)) {
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
})();
