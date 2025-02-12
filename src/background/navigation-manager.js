import '@/js/browser';
import {kAboutBlank} from '@/js/consts';
import {CHROME, FIREFOX} from '@/js/ua';
import {chromeProtectsNTP, ownRoot} from '@/js/urls';
import {deepEqual} from '@/js/util';
import {ignoreChromeError, MF} from '@/js/util-webext';
import {pingTab, sendTab} from './broadcast';
import {bgBusy, onUrlChange} from './common';
import tabCache from './tab-manager';

export const webNavigation = chrome.webNavigation;
/** @type {{ url: chrome.events.UrlFilter[] }} */
const WEBNAV_FILTER_STYLABLE = {
  url: [
    {schemes: ['http', 'https', 'file', 'ftp', 'ftps']},
    {urlPrefix: ownRoot},
  ],
};
export const kCommitted = 'committed';
let prevData = {};

webNavigation.onCommitted.addListener(onNavigation.bind(null, kCommitted),
  WEBNAV_FILTER_STYLABLE);
webNavigation.onHistoryStateUpdated.addListener(onNavigation.bind(null, 'history'),
  WEBNAV_FILTER_STYLABLE);
webNavigation.onReferenceFragmentUpdated.addListener(onNavigation.bind(null, 'hash'),
  WEBNAV_FILTER_STYLABLE);

async function onNavigation(navType, data) {
  if (CHROME && __.BUILD !== 'firefox' &&
      data.timeStamp === prevData.timeStamp && deepEqual(data, prevData)) {
    return; // Chrome bug: listener is called twice with identical data
  }
  prevData = data;
  if (bgBusy) await bgBusy;
  if (!__.MV3 &&
      CHROME && __.BUILD !== 'firefox' &&
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
  const {tabId} = data;
  const td = tabCache[tabId];
  if (td && navType !== kCommitted) {
    const {frameId: f, url} = data;
    const {documentId: d, frameType} = data;
    sendTab(tabId, {
      method: 'urlChanged',
      top: !frameType && !f || frameType === 'outer_frame',
      iid: !__.MV3 && td.iid?.[f] || 0,
      url,
    }, __.MV3 || d
      ? {documentId: d}
      : {frameId: f});
  }
  for (const fn of onUrlChange) fn(data, navType);
}

if (!__.MV3) {
  /*
   * Expose style version on greasyfork/sleazyfork 1) info page and 2) code page
   * Not using manifest.json to avoid injecting in unrelated sub-pages.
   */
  const urlMatches = '/scripts/\\d+[^/]*(/code)?([?#].*)?$';
  webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: `/${__.JS}install-hook-greasyfork.js`,
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
  webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: `/${__.JS}install-hook-userstylesworld.js`,
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
  if (__.BUILD !== 'chrome' && FIREFOX) {
    webNavigation.onDOMContentLoaded.addListener(async ({tabId, frameId}) => {
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
