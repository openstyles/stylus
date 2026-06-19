import {kAboutBlank} from '@/js/consts';
import {CHROME, FIREFOX} from '@/js/ua';
import {ownRoot} from '@/js/urls';
import {deepEqual, NOP} from '@/js/util';
import {MF, webNavigation} from '@/js/util-webext';
import {pingTab, sendTab} from './broadcast';
import {bgBusy, onUrlChange} from './common';
import {tabCache} from './tab-manager';

/** @type {{ url: chrome.events.UrlFilter[] }} */
const FILTER = (__.B_CHROME || __.B_ANY && CHROME)
  ? {url: [{schemes: ['http', 'https', 'file', 'chrome', 'chrome-extension']}]}
  : undefined;
export const kCommitted = 'committed';
/** @type {{[url: string]: number[]}} */
export const ownPagesCommitted = {};
let prevData = {};

webNavigation.onCommitted.addListener(onNavigation.bind(null, kCommitted), FILTER);
webNavigation.onHistoryStateUpdated.addListener(onNavigation.bind(null, 'history'), FILTER);
webNavigation.onReferenceFragmentUpdated.addListener(onNavigation.bind(null, 'hash'), FILTER);

async function onNavigation(navType, data) {
  const {url} = data;
  if (!__.B_FIREFOX &&
    // https://crbug.com/40365717 listener is called twice with identical data
    CHROME <= 143 && data.timeStamp === prevData.timeStamp && deepEqual(data, prevData)
  ) {
    return;
  }
  prevData = data;
  if (bgBusy) await bgBusy;
  const {tabId} = data;
  const td = tabCache[tabId];
  if (navType === kCommitted) {
    if (url.startsWith(ownRoot))
      (ownPagesCommitted[url] ??= []).push(tabId);
  } else if (td) {
    const {frameId: f} = data;
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
  const exec = browser.tabs.executeScript;
  /*
   * Expose style version on greasyfork/sleazyfork 1) info page and 2) code page
   * Not using manifest.json to avoid injecting in unrelated sub-pages.
   */
  const urlMatches = '/scripts/\\d+[^/]*(/code)?([?#].*)?$';
  webNavigation.onCommitted.addListener(({tabId}) => {
    exec(tabId, {
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
    exec(tabId, {
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
  if (__.B_FIREFOX || __.B_ANY && FIREFOX) {
    webNavigation.onDOMContentLoaded.addListener(async ({tabId, frameId}) => {
      if (frameId && !await pingTab(tabId, frameId)) {
        for (const file of MF.content_scripts[0].js) {
          exec(tabId, {
            frameId,
            file,
            matchAboutBlank: true,
          }).catch(NOP);
        }
      }
    }, {
      url: [{urlEquals: kAboutBlank}],
    });
  }
}
