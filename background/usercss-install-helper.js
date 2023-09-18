/* global RX_META URLS */// toolbox.js
/* global addAPI bgReady download */// common.js
/* global prefs */
/* global tabMan */// tab-manager.js
/* global openURL */// tab-util.js
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

  const maybeDistro = {
    'bitbucket.org': '/USER/REPO/raw/HEAD/FILE',
    'dl.dropboxusercontent.com': '/s/HASH/FILE',
    'gist.github.com': '/USER/HASH/raw/(HASH/)?FILE',
    'gitlab.com': '/USER/REPO/(-/)?raw/BRANCH/FILE',
    'greasyfork.org': '/scripts/NAME/code/FILE',
    'raw.githack.com': '/USER/REPO/BRANCH/FILE',
    'raw.githubusercontent.com': '/USER/REPO/BRANCH/FILE',
    'rawcdn.githack.com': '/USER/REPO/TAG/FILE',
    'sleazyfork.org': '/scripts/NAME/code/FILE',
  };

  prefs.subscribe('urlInstaller', toggle, true);

  function toggle(key, val) {
    chrome.webRequest.onBeforeSendHeaders.removeListener(maybeInstallFromDistro);
    chrome.webRequest.onHeadersReceived.removeListener(rememberContentType);
    tabMan.onOff(maybeInstall, val);
    if (!val) return;
    const types = ['main_frame'];
    const urls = [
      URLS.usw + 'api/style/*.user.*',
      URLS.usoaRaw[0] + 'usercss/*.user.css',
    ];
    for (const [host, val] of Object.entries(maybeDistro)) {
      let {glob} = val;
      if (!glob) {
        maybeDistro[host] = {
          glob: glob = makeUsercssGlobs(host, val
            .replace(/[A-Z]+/g, '*') // UPPERCASE -> *
            .replace(/\(.*?\)\?/g, '*') // (optional)? -> *
            .replace(/\*{2,}/g, '*')), // ** -> *
          rx: new RegExp(
            // FILE may contain slashes e.g. /path/foo/bar but other templates cannot
            val.replace(/FILE/g, String.raw`.*\.user\.(css|less|styl)(\?.*)?$`)
              .replace(/[A-Z]+/g, '[^/]+')),
        };
      }
      urls.push(...glob);
    }
    chrome.webRequest.onBeforeSendHeaders.addListener(maybeInstallFromDistro,
      {urls, types}, ['blocking']);
    chrome.webRequest.onHeadersReceived.addListener(rememberContentType,
      {urls: makeUsercssGlobs(), types}, ['responseHeaders']);
  }

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
      tabMan.get(tabId, isContentTypeText.name)
    ) && download(url);
  }

  function makeInstallerUrl(url) {
    return `${URLS.installUsercss}?updateUrl=${encodeURIComponent(url)}`;
  }

  function makeUsercssGlobs(host, path) {
    return '%css,%less,%styl'
      .replace(/%\w+/g, host ? '$&*' : '$&,$&?*')
      .replace(/%/g, `*://${host || '*'}${path || '/*'}.user.`)
      .split(',');
  }

  async function maybeInstall({tabId, url, oldUrl = ''}) {
    if (url.includes('.user.') &&
        !tabMan.get(tabId, 'distro') &&
        /^(https?|file|ftps?):/.test(url) &&
        /\.user\.(css|less|styl)$/.test(url.split(/[#?]/, 1)[0]) &&
        !oldUrl.startsWith(makeInstallerUrl(url))) {
      const inTab = url.startsWith('file:') && !chrome.app;
      const code = await (inTab ? loadFromFile : loadFromUrl)(tabId, url);
      if (!/^\s*</.test(code) && RX_META.test(code)) {
        await openInstallerPage(tabId, url, {code, inTab});
      }
    }
  }

  /** Faster installation on known distribution sites to avoid flicker of css text */
  function maybeInstallFromDistro({tabId, url}) {
    const u = new URL(url);
    const m = maybeDistro[u.hostname];
    tabMan.set(tabId, 'distro', true);
    if (!m || m.rx.test(u.pathname)) {
      openInstallerPage(tabId, url, {});
      // Silently suppress navigation.
      // Don't redirect to the install URL as it'll flash the text!
      return {cancel: true};
    }
  }

  async function openInstallerPage(tabId, url, {code, inTab} = {}) {
    const newUrl = makeInstallerUrl(url);
    if (inTab) {
      const tab = await browser.tabs.get(tabId);
      return openURL({
        url: `${newUrl}&tabId=${tabId}`,
        active: tab.active,
        index: tab.index + 1,
        openerTabId: tabId,
        currentWindow: null,
      });
    }
    const timer = setTimeout(clearInstallCode, 10e3, url);
    installCodeCache[url] = {code, timer};
    try {
      await browser.tabs.update(tabId, {url: newUrl});
    } catch (err) {
      // FIXME: remove this when kiwi supports tabs.update
      // https://github.com/openstyles/stylus/issues/1367
      if (/Tabs cannot be edited right now/i.test(err.message)) {
        return browser.tabs.create({url: newUrl});
      }
      throw err;
    }
  }

  /** Remember Content-Type to avoid wasting time to re-fetch in loadFromUrl **/
  function rememberContentType({tabId, responseHeaders}) {
    const h = responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
    tabMan.set(tabId, isContentTypeText.name, h && isContentTypeText(h.value) || undefined);
  }
});
