import '@/js/browser';
import {kUrl} from '@/js/consts';
import * as URLS from '@/js/urls';
import {sleep, stringAsRegExpStr} from '@/js/util';
import {ignoreChromeError, MF} from '@/js/util-webext';
import {sendTab} from './broadcast';
import {webNavigation} from './navigation-manager';
import * as tabMan from './tab-manager';

let initialized;

/**
 Reinject content scripts when the extension is reloaded/updated.
 Not used in Firefox as it reinjects automatically.
 @param {chrome.tabs.Tab} [targetTab]
 @return {?boolean} whether targetTab's top doc is injectable
 */
export default async function reinjectContentScripts(targetTab) {
  const ALL_URLS = '<all_urls>';
  const SCRIPTS = MF.content_scripts;
  const globToRe = (s, re = '.') => stringAsRegExpStr(s.replace(/\*/g, '\n')).replace(/\n/g, re + '*?');
  const busyTabs = /*@__PURE__*/new Set();
  if (!initialized) {
    initialized = true;
    for (const cs of SCRIPTS) {
      if ((cs[ALL_URLS] = cs.matches.includes(ALL_URLS))) {
        continue;
      }
      cs.matches.forEach((m, i) => {
        const [, scheme, host, path] = m.match(/^([^:]+):\/\/([^/]+)\/(.*)/);
        cs.matches[i] = new RegExp(`^${
          scheme === '*' ? 'https?' : scheme
        }://${
          globToRe(host, '[^/]')
        }/${
          globToRe(path)
        }$`);
      });
    }
  }
  let busyTabsTimer;

  if (!targetTab) await sleep();

  for (const tab of targetTab ? [targetTab] : await browser.tabs.query({})) {
    const url = tab.pendingUrl || tab.url;
    // Skip unloaded/discarded/chrome tabs.
    const res = tab.width && !tab.discarded && URLS.supported(url) && (
      /* In MV2 persistent background script our content scripts may still be pending
       * injection at browser start, so it's too early to ping them. */
      __.MV3 || targetTab || tab.status !== 'loading'
        ? await injectToTab(tab.id, url, targetTab)
        : trackBusyTab(tab.id, true)
    );
    if (targetTab) {
      return res && res[0] && !res[0].message /* no error */ && res[0].frameId === 0;
    }
  }

  async function injectToTab(tabId, url, targeted) {
    const jobs = [];
    tabMan.set(tabId, kUrl, 0, url);
    if (!targeted && await sendTab(tabId, {method: 'backgroundReady'})) {
      return;
    }
    for (const cs of SCRIPTS) {
      if (!cs[ALL_URLS] && !cs.matches.some(url.match, url)) {
        continue;
      }
      if (__.MV3) {
        jobs.push(chrome.scripting.executeScript({
          injectImmediately: cs.run_at === 'document_start',
          target: {
            allFrames: cs.all_frames,
            tabId,
          },
          files: cs.js,
        }).catch(ignoreChromeError));
      } else {
        const options = {
          runAt: cs.run_at,
          allFrames: cs.all_frames,
          matchAboutBlank: cs.match_about_blank,
        };
        for (const file of cs.js) {
          options.file = file;
          jobs.push(browser.tabs.executeScript(tabId, options).catch(ignoreChromeError));
        }
      }
    }
    return Promise.all(jobs);
  }

  function toggleBusyTabListeners(state) {
    const toggle = state ? 'addListener' : 'removeListener';
    webNavigation.onCompleted[toggle](onBusyTabUpdated);
    webNavigation.onErrorOccurred[toggle](onBusyTabUpdated);
    webNavigation.onTabReplaced[toggle](onBusyTabReplaced);
    chrome.tabs.onRemoved[toggle](onBusyTabRemoved);
    if (state) {
      busyTabsTimer = setTimeout(toggleBusyTabListeners, 15e3, false);
    } else {
      clearTimeout(busyTabsTimer);
    }
  }

  function trackBusyTab(tabId, state) {
    busyTabs[state ? 'add' : 'delete'](tabId);
    if (state && busyTabs.size === 1) toggleBusyTabListeners(true);
    if (!state && !busyTabs.size) toggleBusyTabListeners(false);
  }

  function onBusyTabUpdated({error, frameId, tabId, url}) {
    if (!frameId && busyTabs.has(tabId)) {
      trackBusyTab(tabId, false);
      if (url && !error && URLS.supported(url)) {
        injectToTab(tabId, url);
      }
    }
  }

  function onBusyTabReplaced({replacedTabId}) {
    trackBusyTab(replacedTabId, false);
  }

  function onBusyTabRemoved(tabId) {
    trackBusyTab(tabId, false);
  }
}
