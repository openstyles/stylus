import '/js/browser';
import {kAboutBlank} from '/js/consts';
import {CHROME, FIREFOX} from '/js/ua';
import {chromeProtectsNTP} from '/js/urls';
import {deepEqual} from '/js/util';
import {ignoreChromeError, MF} from '/js/util-webext';
import {pingTab, sendTab} from './broadcast';
import * as tabMan from './tab-manager';

const listeners = new Set();
/** @param {function(data: Object, type: ('committed'|'history'|'hash'))} fn */
export const onUrlChange = fn => listeners.add(fn);
/** @type {{ url: chrome.events.UrlFilter[] }} */
export const WEB_NAV_FILTER_STYLABLE = {
  url: [{schemes: ['http', 'https', 'file', 'ftp', 'ftps']}],
};
let prevData = {};

chrome.webNavigation.onCommitted.addListener(onNavigation.bind(['committed']),
  WEB_NAV_FILTER_STYLABLE);
chrome.webNavigation.onHistoryStateUpdated.addListener(onFakeNavigation.bind(['history']),
  WEB_NAV_FILTER_STYLABLE);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(onFakeNavigation.bind(['hash']),
  WEB_NAV_FILTER_STYLABLE);

/** @this {string[]} type */
async function onNavigation(data) {
  if (CHROME && data.timeStamp === prevData.timeStamp && deepEqual(data, prevData)) {
    return; // Chrome bug: listener is called twice with identical data
  }
  prevData = data;
  if (!process.env.MV3 &&
      CHROME &&
      chromeProtectsNTP &&
      data.url.startsWith('https://www.google.') &&
      data.url.includes('/_/chrome/newtab?')) {
    // Modern Chrome switched to WebUI NTP so this is obsolete, but there may be exceptions
    // TODO: investigate, and maybe use a separate listener for CHROME <= ver
    const tab = await browser.tabs.get(data.tabId);
    const url = tab.pendingUrl || tab.url;
    if (url === 'chrome://newtab/') {
      data.url = url;
    }
  }
  for (const fn of listeners) fn(data, this[0]);
}

/** @this {string} type */
function onFakeNavigation(data) {
  onNavigation.call(this, data);
  const {tabId} = data;
  const td = tabMan.get(tabId); if (!td) return;
  const {url, frameId: f, documentId: d} = data;
  const iid = !process.env.MV3 && !d && td.iid?.[f];
  const to = process.env.MV3 || d ? {documentId: d} : {frameId: f};
  sendTab(tabId, {method: 'urlChanged', iid, url}, to);
}

if (!process.env.MV3) {
  /*
   * Expose style version on greasyfork/sleazyfork 1) info page and 2) code page
   * Not using manifest.json to avoid injecting in unrelated sub-pages.
   */
  const urlMatches = '/scripts/\\d+[^/]*(/code)?([?#].*)?$';
  chrome.webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-greasyfork.js',
      runAt: 'document_start',
    });
  }, {
    url: [
      {hostEquals: 'greasyfork.org', urlMatches},
      {hostEquals: 'sleazyfork.org', urlMatches},
    ],
  });

  /*
   * Removes the Get Stylus button on style pages.
   * Not using manifest.json as adding a content script may disable the extension on update.
   */
  chrome.webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-userstylesworld.js',
      runAt: 'document_start',
    });
  }, {
    url: [
      {hostEquals: 'userstyles.world'},
    ],
  });
  /*
   * FF misses some about:blank iframes so we inject our content script explicitly
   */
  if (process.env.BUILD !== 'chrome' && FIREFOX) {
    chrome.webNavigation.onDOMContentLoaded.addListener(async ({tabId, frameId}) => {
      if (frameId && !await pingTab(tabId, frameId)) {
        for (const file of MF.content_scripts[0].js) {
          chrome.tabs.executeScript(tabId, {
            frameId,
            file,
            matchAboutBlank: true,
          }, ignoreChromeError);
        }
      }
    }, {
      url: [{urlEquals: kAboutBlank}],
    });
  }
}
