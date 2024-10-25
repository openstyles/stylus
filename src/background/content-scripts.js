import '/js/browser';
import {sendTab} from '/js/msg';
import {ignoreChromeError, MF} from '/js/util-webext';
import * as URLS from '/js/urls';
import {stringAsRegExpStr} from '/js/util';
import tabMan from './tab-manager';

/**
 Reinject content scripts when the extension is reloaded/updated.
 Not used in Firefox as it reinjects automatically.
 */
export default function reinjectContentScripts() {
  const ALL_URLS = '<all_urls>';
  const SCRIPTS = MF.content_scripts;
  const globToRe = (s, re = '.') => stringAsRegExpStr(s.replace(/\*/g, '\n')).replace(/\n/g, re + '*?');
  for (const cs of SCRIPTS) {
    if (!(cs[ALL_URLS] = cs.matches.includes(ALL_URLS))) {
      cs.matches.forEach((m, i) => {
        const [, scheme, host, path] = m.match(/^([^:]+):\/\/([^/]+)\/(.*)/);
        cs.matches[i] = new RegExp(
          `^${scheme === '*' ? 'https?' : scheme}://${globToRe(host, '[^/]')}/${globToRe(path)}$`);
      });
    }
  }
  const busyTabs = new Set();
  let busyTabsTimer;

  setTimeout(injectToAllTabs);

  async function injectToTab(tabId, url) {
    const jobs = [];
    tabMan.set(tabId, 'url', url);
    if (await sendTab(tabId, {method: 'backgroundReady'})) {
      return;
    }
    for (const cs of SCRIPTS) {
      if (!cs[ALL_URLS] && !cs.matches.some(url.match, url)) {
        continue;
      }
      if (process.env.MV3) {
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
    await Promise.all(jobs);
  }

  async function injectToAllTabs() {
    for (const tab of await browser.tabs.query({})) {
      const url = tab.pendingUrl || tab.url;
      // skip unloaded/discarded/chrome tabs
      if (!tab.width || tab.discarded || !URLS.supported(url)) continue;
      // our content scripts may still be pending injection at browser start so it's too early to ping them
      if (tab.status === 'loading') {
        trackBusyTab(tab.id, true);
      } else {
        await injectToTab(tab.id, url);
      }
    }
  }

  function toggleBusyTabListeners(state) {
    const toggle = state ? 'addListener' : 'removeListener';
    chrome.webNavigation.onCompleted[toggle](onBusyTabUpdated);
    chrome.webNavigation.onErrorOccurred[toggle](onBusyTabUpdated);
    chrome.webNavigation.onTabReplaced[toggle](onBusyTabReplaced);
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
