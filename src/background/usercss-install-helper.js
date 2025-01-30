import '@/js/browser';
import {kContentType, kMainFrame} from '@/js/consts';
import {DNR_ID_INSTALLER, updateDynamicRules} from '@/js/dnr';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import * as URLS from '@/js/urls';
import {getHost, RX_META} from '@/js/util';
import {bgBusy, onTabUrlChange} from './common';
import download from './download';
import tabCache, * as tabMan from './tab-manager';
import {openURL} from './tab-util';

const installCodeCache = {};
const MIME = 'mime';
export const kUrlInstaller = 'urlInstaller';

bgBusy.then(() => {
  prefs.subscribe(kUrlInstaller, toggle, true);
});

export function getInstallCode(url) {
  // when the installer tab is reloaded after the cache is expired, this will throw intentionally
  const {code, timer} = installCodeCache[url];
  clearInstallCode(url);
  clearTimeout(timer);
  return code;
}

function toggle(key, val, isInit) {
  if (val) onTabUrlChange.add(maybeInstall);
  else onTabUrlChange.delete(maybeInstall);
  if (!__.MV3 || !isInit) toggleUrlInstaller(val);
}

export function toggleUrlInstaller(val) {
  const urls = val ? [''] : [
    /* Known distribution sites where we ignore urlInstaller option, because
       they open .user.css URL only when the "Install" button is clicked.
       We can't be sure of it on general-purpose sites like github.com. */
    URLS.usw,
    ...URLS.usoaRaw,
    ...['greasy', 'sleazy'].map(h => `https://update.${h}fork.org/`),
  ];
  if (__.MV3) {
    updateDynamicRules([{
      id: DNR_ID_INSTALLER,
      condition: {
        regexFilter: (val
          ? /^.*\.user\.(?:css|less|styl)(?:\?.*)?$/
          : /^.*\.user\.css$/).source,
        requestDomains: val
          ? undefined
          : [...new Set(urls.map(getHost))],
        resourceTypes: [kMainFrame],
        responseHeaders: [{
          header: kContentType,
          values: ['text/*'],
          excludedValues: ['text/html*'], // * excludes charset and whatnot
        }],
      },
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: chrome.runtime.getURL(URLS.installUsercss + '#\\0'),
        },
      },
    }]);
  } else {
    chrome.webRequest.onHeadersReceived.removeListener(maybeInstallByMime);
    chrome.webRequest.onHeadersReceived.addListener(maybeInstallByMime, {
      urls: urls.reduce(reduceUsercssGlobs, []),
      types: [kMainFrame],
    }, ['responseHeaders', 'blocking']);
  }
}

function clearInstallCode(url) {
  delete installCodeCache[url];
}

/** Ignoring .user.css response that is not a plain text but a web page.
 * Not using a whitelist of types as the possibilities are endless e.g. text/x-css-stylus */
function isContentTypeText(type) {
  return /^text\/(?!html)/i.test(type);
}

// in Firefox we have to use a content script to read file://
async function loadFromFile(tabId) {
  return (await browser.tabs.executeScript(tabId, {
    file: `/${__.JS}install-hook-usercss.js`,
  }))[0];
}

async function loadFromUrl(tabId, url) {
  return (
    url.startsWith('file:') ||
    tabCache[tabId]?.[MIME]
  ) && download(url);
}

function makeInstallerUrl(url) {
  return `${URLS.ownRoot}${URLS.installUsercss}?updateUrl=${encodeURIComponent(url)}`;
}

function reduceUsercssGlobs(res, host) {
  res.push(...'%css,%less,%styl'
    .replace(/%\w+/g, host ? '$&*' : '$&,$&?*')
    .replace(/%/g, `${host || '*://*/'}*.user.`)
    .split(','));
  return res;
}

async function maybeInstall(tabId, url, oldUrl = '') {
  if (url.includes('.user.') &&
      tabCache[tabId]?.[MIME] !== false &&
      /^(https?|file|ftps?):/.test(url) &&
      /\.user\.(css|less|styl)$/.test(url.split(/[#?]/, 1)[0]) &&
      !oldUrl.startsWith(makeInstallerUrl(url))) {
    const inTab = FIREFOX && url.startsWith('file:');
    const code = await (inTab ? loadFromFile : loadFromUrl)(tabId, url);
    if (!/^\s*</.test(code) && RX_META.test(code)) {
      await openInstallerPage(tabId, url, {code, inTab});
    }
  }
}

function maybeInstallByMime({tabId, url, responseHeaders}) {
  const h = responseHeaders.find(_ => _.name.toLowerCase() === kContentType);
  const isText = h && isContentTypeText(h.value);
  tabMan.set(tabId, MIME, isText);
  if (isText) {
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
